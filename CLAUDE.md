# Project Configuration

## Second brains
All project knowledge – architecture decisions, error patterns, dependency choices, discussions, and context – lives in the **NotebookLM notebook - nlm-cli-skill**. This file does NOT store knowledge. The notebook is the single source of truth.

- Whenever new feature created, create new notebookLM source
- Whenever updating new feature, update notebookLM source

## Implementations & Best Practices
- Apply TDD - Test Driven Development methods
- Use `context7` for latest documentation reference everytime you make changes

## Project Structure

```
.
├── packages/         # Core workflow package
├── examples/         # Example implementations
├── go.mod            # Go module definition
├── go.sum            # Go module checksums
├── Makefile          # Build automation
└── .golangci.yml     # Linter configuration
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


