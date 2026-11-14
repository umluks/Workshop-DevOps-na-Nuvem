package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

type order struct {
	RunID   string `json:"runId"`
	OrderID string `json:"orderId"`
	Shard   int    `json:"shard"`
	SentAt  int64  `json:"sentAt"`
}

type result struct {
	status  int
	latency time.Duration
	err     string
}

func positiveEnv(name string) int {
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil || value <= 0 {
		fmt.Fprintln(os.Stderr, "Informe um inteiro positivo em", name)
		os.Exit(1)
	}
	return value
}

func main() {
	total := positiveEnv("REQUESTS_TOTAL")
	seconds := positiveEnv("DURATION_SECONDS")
	shards := positiveEnv("ORDER_SHARDS")
	window := time.Duration(seconds) * time.Second
	// A rodada anterior observou 1,66 s em média. Dimensione para 2,4 s.
	concurrency := min(total, int(math.Ceil(float64(total)/float64(seconds)*2.4)))
	if os.Getenv("ORDER_LOCAL_CONCURRENCY") != "" {
		concurrency = min(total, positiveEnv("ORDER_LOCAL_CONCURRENCY"))
	}
	endpoint := strings.TrimRight(os.Getenv("API_URL"), "/") + "/orders"
	runID, apiKey := os.Getenv("RUN_ID"), os.Getenv("API_KEY")
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = concurrency
	transport.MaxIdleConnsPerHost = concurrency
	transport.ForceAttemptHTTP2 = true
	client := &http.Client{
		Transport: transport, Timeout: 10 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	defer transport.CloseIdleConnections()

	results := make([]result, total)
	slots := make(chan struct{}, concurrency)
	var pending sync.WaitGroup
	start := time.Now()
	deadline := start.Add(window)
	schedulingWindow := window - min(200*time.Millisecond, window/100)
	// Cada milissegundo libera apenas a parcela devida até aquele ponto.
	// A janela encerra novos envios. As respostas em trânsito ainda são coletadas.
	for sequence := 0; sequence < total; {
		elapsed := time.Since(start)
		if elapsed >= window {
			break
		}
		due := min(total, int(float64(total)*float64(elapsed)/float64(schedulingWindow))+1)
		for sequence < due && time.Now().Before(deadline) {
			select {
			case slots <- struct{}{}:
				pending.Add(1)
				go func(index int) {
					defer pending.Done()
					defer func() { <-slots }()
					if !time.Now().Before(deadline) {
						return
					}
					results[index] = send(client, endpoint, apiKey, order{
						RunID: runID, OrderID: "order_" + strconv.Itoa(index),
						Shard: index % shards, SentAt: time.Now().UnixMilli(),
					})
				}(sequence)
			default:
				// O gerador atingiu o limite de requisições em trânsito.
			}
			sequence++
		}
		time.Sleep(min(time.Millisecond, max(0, time.Until(deadline))))
	}
	pending.Wait()

	statuses := make(map[int]int)
	latencies := make([]float64, 0, total)
	var sent, accepted, networkErrors int
	var networkErrorSample string
	for _, response := range results {
		if response.status == 0 && response.err == "" {
			continue
		}
		sent++
		if response.err != "" {
			networkErrors++
			if networkErrorSample == "" {
				networkErrorSample = response.err
			}
			continue
		}
		statuses[response.status]++
		latencies = append(latencies, float64(response.latency)/float64(time.Millisecond))
		if response.status == http.StatusOK || response.status == http.StatusAccepted {
			accepted++
		}
	}
	slices.Sort(latencies)
	report := map[string]any{
		"runId": runID, "target": total, "windowSeconds": seconds, "maxInFlight": concurrency,
		"orders_sent": sent, "orders_accepted": accepted, "orders_failed": sent - accepted,
		"orders_not_sent": total - sent, "network_errors": networkErrors, "http_statuses": statuses,
		"http_p95_ms": percentile(latencies, 0.95), "http_p99_ms": percentile(latencies, 0.99),
	}
	if networkErrorSample != "" {
		report["network_error_sample"] = networkErrorSample
	}
	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(encoded))
	if err := os.WriteFile(os.Getenv("ORDER_LOCAL_REPORT"), append(encoded, '\n'), 0644); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if sent != total || accepted != total {
		os.Exit(1)
	}
}

func send(client *http.Client, endpoint, apiKey string, payload order) result {
	body, err := json.Marshal(payload)
	if err != nil {
		return result{err: err.Error()}
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return result{err: err.Error()}
	}
	req.GetBody = nil
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return result{err: err.Error()}
	}
	defer resp.Body.Close()
	if _, err := io.Copy(io.Discard, resp.Body); err != nil {
		return result{err: err.Error()}
	}
	return result{status: resp.StatusCode, latency: time.Since(start)}
}

func percentile(values []float64, fraction float64) any {
	if len(values) == 0 {
		return nil
	}
	return values[int(math.Ceil(float64(len(values))*fraction))-1]
}
