//go:build !race

package storage

import "time"

const batchInsertDeadline = 100 * time.Millisecond
