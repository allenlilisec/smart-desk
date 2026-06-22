// Package outbox provides transactional outbox pattern implementation for event publishing.
package outbox

import (
	"math"
	"math/rand"
	"time"
)

// exponentialBackoff calculates the delay duration for retry attempts using exponential backoff with jitter.
// Base delay starts at 1 second and doubles with each retry, capped at 5 minutes.
// Jitter is ±10% to avoid thundering herd.
//
// Parameters:
//   - retryCount: The current retry attempt (0-based)
//
// Returns:
//   - The calculated delay duration
func exponentialBackoff(retryCount int) time.Duration {
	const (
		baseDelay = time.Second
		maxDelay  = 5 * time.Minute
		jitterPct = 0.1 // ±10%
	)

	// Calculate base exponential delay: 2^retryCount seconds
	delay := baseDelay * time.Duration(math.Pow(2, float64(retryCount)))

	// Cap at max delay
	if delay > maxDelay {
		delay = maxDelay
	}

	// Apply ±10% jitter to avoid thundering herd
	// jitter = delay * (0.9 to 1.1)
	jitter := float64(delay) * (1.0 - jitterPct + 2*jitterPct*rand.Float64())

	return time.Duration(jitter)
}

// ExponentialBackoffSequence returns the sequence of delays for the first n retries.
// Useful for testing and documentation.
func ExponentialBackoffSequence(n int) []time.Duration {
	sequence := make([]time.Duration, n)
	for i := 0; i < n; i++ {
		sequence[i] = exponentialBackoff(i)
	}
	return sequence
}

// NextRetryAt calculates the next retry timestamp based on current time and retry count.
func NextRetryAt(now time.Time, retryCount int) time.Time {
	return now.Add(exponentialBackoff(retryCount))
}
