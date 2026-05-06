.PHONY: dev build test proxy-build proxy-test ui-check clean

PROXY_DIR   := proxy
DESKTOP_DIR := desktop
BINS        := $(DESKTOP_DIR)/src-tauri/binaries

dev:
	cd $(DESKTOP_DIR) && npm run tauri dev

ui-dev:
	cd $(DESKTOP_DIR) && npm run dev

proxy-build:
	cd $(PROXY_DIR) && CGO_ENABLED=0 go build -ldflags="-s -w" \
	  -o ../$(BINS)/spektr        ./cmd/spektr
	cd $(PROXY_DIR) && CGO_ENABLED=0 go build -ldflags="-s -w" \
	  -o ../$(BINS)/spektr-proxy  ./cmd/spektr-proxy

proxy-test:
	cd $(PROXY_DIR) && go test -race ./...

proxy-lint:
	cd $(PROXY_DIR) && go vet ./...

ui-check:
	cd $(DESKTOP_DIR) && npx tsc --noEmit

test: proxy-test ui-check

build: proxy-build
	cd $(DESKTOP_DIR) && npm run tauri build

clean:
	rm -rf $(DESKTOP_DIR)/dist $(DESKTOP_DIR)/src-tauri/target
	find $(PROXY_DIR) -name '*.test' -delete
