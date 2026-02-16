Default to using Go for all development tasks.

## Build & Run

- Use `go build` to compile packages and dependencies
- Use `go run <file.go>` to compile and run Go programs
- Use `go install` to compile and install packages
- Use `make build` to build the project using Makefile targets

## Dependencies

- Use `go get <package>` to add dependencies
- Use `go mod tidy` to add missing and remove unused modules
- Use `go mod download` to download modules to local cache
- Use `go mod vendor` to make vendored copy of dependencies
- Use `make deps` or `make install` to download all dependencies

## Testing

Use `go test` to run tests.

```go
package example

import "testing"

func TestHelloWorld(t *testing.T) {
    expected := "hello"
    actual := "hello"
    if actual != expected {
        t.Errorf("got %s, want %s", actual, expected)
    }
}
```

Run tests with:
```sh
go test ./...                    # Run all tests
go test -v ./...                 # Verbose output
go test -race ./...              # Run with race detector
go test -cover ./...             # Show coverage
make test                        # Run tests via Makefile
make test-coverage               # Run tests with coverage report
```

## Code Quality

### Linting

Use `golangci-lint` for comprehensive linting:

```sh
golangci-lint run ./...          # Run all linters
make lint                        # Run linter via Makefile
make lint-fix                    # Run linter and auto-fix issues
```

### Formatting

Go has built-in formatting tools:

```sh
gofmt -s -w .                    # Format all Go files
goimports -w .                   # Format and organize imports
make format                      # Format code via Makefile
make format-check                # Check if code is formatted
```

## Project Structure

```
.
├── workflow/           # Core workflow package
├── examples/          # Example implementations
├── go.mod            # Go module definition
├── go.sum            # Go module checksums
├── Makefile          # Build automation
└── .golangci.yml     # Linter configuration
```

## Common Commands

```sh
# Development
make build            # Build the project
make test             # Run tests
make lint             # Run linter
make format           # Format code
make check            # Run format-check, lint, and test

# Dependencies
make deps             # Download dependencies
make tidy             # Tidy go.mod and go.sum
make vendor           # Vendor dependencies

# Cleanup
make clean            # Clean build artifacts
```

## AWS Lambda

For AWS Lambda functions, use the `aws-lambda-go` library:

```go
package main

import (
    "context"
    "github.com/aws/aws-lambda-go/lambda"
)

type Event struct {
    Name string `json:"name"`
}

type Response struct {
    Message string `json:"message"`
}

func handler(ctx context.Context, event Event) (Response, error) {
    return Response{
        Message: "Hello " + event.Name,
    }, nil
}

func main() {
    lambda.Start(handler)
}
```

Build for Lambda:
```sh
GOOS=linux GOARCH=amd64 go build -o bootstrap main.go
zip function.zip bootstrap
```

## Best Practices

- Always run `go mod tidy` after adding/removing dependencies
- Use `make format` before committing code
- Run `make lint` to catch potential issues
- Use `make test` to ensure tests pass
- Follow Go naming conventions (exported names start with capital letters)
- Keep package names short and lowercase
- Write tests for all public functions
- Use context.Context for cancellation and timeouts
- Handle all errors explicitly
