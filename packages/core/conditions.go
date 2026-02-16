package core

// PayloadBool returns a condition that checks if a payload boolean field is true
func PayloadBool[E Entity](key string) ConditionFunc[E] {
	return func(_ E, payload map[string]any) bool {
		value, ok := payload[key].(bool)
		return ok && value
	}
}

// PayloadString returns a condition that checks if a payload string matches the expected value
func PayloadString[E Entity](key string, expected string) ConditionFunc[E] {
	return func(_ E, payload map[string]any) bool {
		value, ok := payload[key].(string)
		return ok && value == expected
	}
}

// PayloadExists returns a condition that checks if a payload key exists
func PayloadExists[E Entity](key string) ConditionFunc[E] {
	return func(_ E, payload map[string]any) bool {
		_, ok := payload[key]
		return ok
	}
}

// PayloadNumber returns a condition that checks numeric comparison
// Supported operators: "<", "<=", ">", ">=", "==", "!="
func PayloadNumber[E Entity, N ~int | ~int64 | ~float64](key string, op string, expected N) ConditionFunc[E] {
	return func(_ E, payload map[string]any) bool {
		var value N
		switch v := payload[key].(type) {
		case int:
			value = N(v)
		case int64:
			value = N(v)
		case float64:
			value = N(v)
		default:
			return false
		}

		switch op {
		case "<":
			return value < expected
		case "<=":
			return value <= expected
		case ">":
			return value > expected
		case ">=":
			return value >= expected
		case "==":
			return value == expected
		case "!=":
			return value != expected
		default:
			return false
		}
	}
}

// And combines conditions with AND logic
// All conditions must be true for the result to be true
func And[E Entity](conditions ...ConditionFunc[E]) ConditionFunc[E] {
	return func(entity E, payload map[string]any) bool {
		for _, cond := range conditions {
			if !cond(entity, payload) {
				return false
			}
		}
		return true
	}
}

// Or combines conditions with OR logic
// At least one condition must be true for the result to be true
func Or[E Entity](conditions ...ConditionFunc[E]) ConditionFunc[E] {
	return func(entity E, payload map[string]any) bool {
		for _, cond := range conditions {
			if cond(entity, payload) {
				return true
			}
		}
		return false
	}
}

// Not negates a condition
func Not[E Entity](condition ConditionFunc[E]) ConditionFunc[E] {
	return func(entity E, payload map[string]any) bool {
		return !condition(entity, payload)
	}
}
