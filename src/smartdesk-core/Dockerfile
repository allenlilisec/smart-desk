# syntax=docker/dockerfile:1
FROM golang:1.23 AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(date +%Y%m%d)" -o /out/smartdesk-core ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/smartdesk-core /smartdesk-core
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/smartdesk-core"]
