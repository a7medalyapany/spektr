package stream

import (
	"log/slog"

	"github.com/gorilla/websocket"
)

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if h.clients[client] {
				delete(h.clients, client)
				close(client.send)
			}
		case data := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- append([]byte(nil), data...):
				default:
					delete(h.clients, client)
					close(client.send)
					if err := client.conn.Close(); err != nil {
						slog.Debug("failed to close slow websocket client", "err", err)
					}
				}
			}
		}
	}
}

func (h *Hub) Broadcast(data []byte) {
	select {
	case h.broadcast <- append([]byte(nil), data...):
	default:
	}
}
