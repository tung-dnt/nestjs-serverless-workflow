# Project Configuration

## Second brains


## Always run tests and quality check after edits

After making any code changes, run `go test`, `gofmt -s -w .`, `goimports -w .`

## Implementations & Best Practices

- Use `/golang-pro` commands skill to implement/write code in best practices, build project
- Use `context7` for latest documentation reference everytime you make changes
- Use 

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


