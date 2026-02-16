.PHONY: help build test test-coverage lint lint-fix format format-check clean install run vendor deps tidy

# Default target
help:
	@echo "Available targets:"
	@echo "  make build         - Build the project"
	@echo "  make test          - Run tests"
	@echo "  make test-coverage - Run tests with coverage"
	@echo "  make lint          - Run linter (golangci-lint)"
	@echo "  make lint-fix      - Run linter and auto-fix issues"
	@echo "  make format        - Format code with gofmt and goimports"
	@echo "  make format-check  - Check code formatting"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make install       - Install dependencies"
	@echo "  make vendor        - Vendor dependencies"
	@echo "  make tidy          - Tidy go.mod and go.sum"
	@echo "  make deps          - Download dependencies"
	@echo "  make run           - Run the application"

# Build the project
build:
	@echo "Building..."
	go build -v ./...

# Run tests
test:
	@echo "Running tests..."
	go test -v -race ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Run linter
lint:
	@echo "Running linter..."
	golangci-lint run ./...

# Run linter with auto-fix
lint-fix:
	@echo "Running linter with auto-fix..."
	golangci-lint run --fix ./...

# Format code
format:
	@echo "Formatting code..."
	gofmt -s -w .
	goimports -w -local github.com/tung-dnt/nestjs-serverless-workflow .

# Check code formatting
format-check:
	@echo "Checking code formatting..."
	@test -z "$$(gofmt -s -l . | tee /dev/stderr)" || (echo "Files need formatting" && exit 1)

# Clean build artifacts
clean:
	@echo "Cleaning..."
	go clean
	rm -f coverage.out coverage.html
	rm -rf dist/

# Install dependencies
install:
	@echo "Installing dependencies..."
	go mod download
	@echo "Installing tools..."
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install golang.org/x/tools/cmd/goimports@latest

# Vendor dependencies
vendor:
	@echo "Vendoring dependencies..."
	go mod vendor

# Tidy dependencies
tidy:
	@echo "Tidying dependencies..."
	go mod tidy

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	go mod download

# Run the application (customize this based on your entry point)
run:
	@echo "Running application..."
	go run ./...

# Verify dependencies
verify:
	@echo "Verifying dependencies..."
	go mod verify

# Check everything (format, lint, test)
check: format-check lint test
	@echo "All checks passed!"
