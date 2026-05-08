//go:build race

package storage

import "time"

const batchInsertDeadline = 400 * time.Millisecond
