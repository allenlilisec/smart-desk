FROM golang:1.25-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/smartdesk-core ./cmd/smartdesk-core

FROM alpine:3.22

RUN addgroup -S smartdesk && adduser -S -G smartdesk smartdesk

COPY --from=build /out/smartdesk-core /usr/local/bin/smartdesk-core

EXPOSE 8080

USER smartdesk
ENTRYPOINT ["/usr/local/bin/smartdesk-core"]
