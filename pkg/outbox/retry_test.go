package outbox

import (
	"math"
	"testing"
	"time"
)

func TestExponentialBackoff_Sequence(t *testing.T) {
	// Test the expected backoff sequence
	// retryCount: 0 -> ~1s, 1 -> ~2s, 2 -> ~4s, 3 -> ~8s, 4 -> ~16s, 5 -> ~32s
	// But with jitter (±10%), we check ranges rather than exact values

	tests := []struct {
		name       string
		retryCount int
		minDelay   time.Duration
		maxDelay   time.Duration
	}{
		{
			name:       "retry 0: base 1s",
			retryCount: 0,
			minDelay:   900 * time.Millisecond,  // 1s - 10%
			maxDelay:   1100 * time.Millisecond, // 1s + 10%
		},
		{
			name:       "retry 1: base 2s",
			retryCount: 1,
			minDelay:   1800 * time.Millisecond, // 2s - 10%
			maxDelay:   2200 * time.Millisecond, // 2s + 10%
		},
		{
			name:       "retry 2: base 4s",
			retryCount: 2,
			minDelay:   3600 * time.Millisecond, // 4s - 10%
			maxDelay:   4400 * time.Millisecond, // 4s + 10%
		},
		{
			name:       "retry 3: base 8s",
			retryCount: 3,
			minDelay:   7200 * time.Millisecond,  // 8s - 10%
			maxDelay:   8800 * time.Millisecond, // 8s + 10%
		},
		{
			name:       "retry 4: base 16s",
			retryCount: 4,
			minDelay:   14400 * time.Millisecond, // 16s - 10%
			maxDelay:   17600 * time.Millisecond, // 16s + 10%
		},
		{
			name:       "retry 5: base 32s",
			retryCount: 5,
			minDelay:   28800 * time.Millisecond, // 32s - 10%
			maxDelay:   35200 * time.Millisecond, // 32s + 10%
		},
		{
			name:       "retry 6: approaching cap",
			retryCount: 6,
			minDelay:   57600 * time.Millisecond, // 64s - 10%
			maxDelay:   70400 * time.Millisecond, // 64s + 10%
		},
		{
			name:       "retry 7: approaching cap",
			retryCount: 7,
			minDelay:   115200 * time.Millisecond, // 128s - 10%
			maxDelay:   140800 * time.Millisecond, // 128s + 10%
		},
		{
			name:       "retry 8: approaching cap",
			retryCount: 8,
			minDelay:   230400 * time.Millisecond, // 256s - 10%
			maxDelay:   281600 * time.Millisecond, // 256s + 10%
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Run multiple times to account for randomness
			for i := 0; i < 10; i++ {
				delay := exponentialBackoff(tt.retryCount)
				if delay < tt.minDelay || delay > tt.maxDelay {
					t.Errorf("exponentialBackoff(%d) = %v, expected range [%v, %v]",
						tt.retryCount, delay, tt.minDelay, tt.maxDelay)
				}
			}
		})
	}
}

func TestExponentialBackoff_CapAt5Minutes(t *testing.T) {
	// Test that backoff is capped at 5 minutes
	// retryCount 8: 2^8 = 256 seconds = ~4.27 minutes (under cap)
	// retryCount 9: 2^9 = 512 seconds = ~8.5 minutes (exceeds cap, should be clamped)

	// Test retry counts that should hit the cap
	highRetryCounts := []int{9, 10, 15, 20}

	for _, retryCount := range highRetryCounts {
		for i := 0; i < 10; i++ {
			delay := exponentialBackoff(retryCount)
			// Should be around 5 minutes ±10%
			minCap := 270 * time.Second // 4.5 minutes
			maxCap := 330 * time.Second // 5.5 minutes

			if delay < minCap || delay > maxCap {
				t.Errorf("exponentialBackoff(%d) = %v, expected capped around 5min (range: %v to %v)",
					retryCount, delay, minCap, maxCap)
			}
		}
	}
}

func TestExponentialBackoff_JitterDistribution(t *testing.T) {
	// Test that jitter is actually applied and distributed around the base value
	retryCount := 2 // 4 seconds base
	baseDelay := 4 * time.Second

	var totalDelay time.Duration
	iterations := 100

	for i := 0; i < iterations; i++ {
		delay := exponentialBackoff(retryCount)
		totalDelay += delay
	}

	avgDelay := totalDelay / time.Duration(iterations)
	diff := math.Abs(float64(avgDelay - baseDelay))
	tolerance := float64(baseDelay) * 0.05 // Allow 5% tolerance

	if diff > tolerance {
		t.Errorf("Average delay %v deviates too much from base %v (diff: %v, tolerance: %v)",
			avgDelay, baseDelay, diff, tolerance)
	}
}

func TestExponentialBackoffSequence(t *testing.T) {
	sequence := ExponentialBackoffSequence(5)

	if len(sequence) != 5 {
		t.Errorf("Expected sequence length 5, got %d", len(sequence))
	}

	// Verify each delay is greater than the previous (accounting for jitter)
	for i := 1; i < len(sequence); i++ {
		// With ±10% jitter, the previous max could be 1.1x and current min 0.9x
		// So we need a looser check: current should generally be greater
		if float64(sequence[i]) < float64(sequence[i-1])*0.8 {
			t.Errorf("Sequence[%d] = %v should be greater than Sequence[%d] = %v (accounting for jitter)",
				i, sequence[i], i-1, sequence[i-1])
		}
	}
}

func TestNextRetryAt(t *testing.T) {
	now := time.Now()
	retryCount := 2

	nextRetry := NextRetryAt(now, retryCount)
	delay := nextRetry.Sub(now)

	// Should be around 4 seconds ±10%
	minDelay := 3600 * time.Millisecond
	maxDelay := 4400 * time.Millisecond

	if delay < minDelay || delay > maxDelay {
		t.Errorf("NextRetryAt delay = %v, expected range [%v, %v]",
			delay, minDelay, maxDelay)
	}
}

// Benchmark for performance validation
func BenchmarkExponentialBackoff(b *testing.B) {
	for i := 0; i < b.N; i++ {
		exponentialBackoff(i % 10)
	}
}
