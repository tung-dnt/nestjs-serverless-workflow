/**
 * Helper that maps all keys unique to `T` (not in `U`) to `never`.
 * Used internally by {@link TEither} to enforce mutually exclusive unions.
 */
export type TWithout<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

/**
 * A true mutually exclusive union of two object types.
 *
 * Unlike `T | U`, this prevents accidentally mixing properties from both
 * types in a single value — only one side is allowed at a time.
 */
export type TEither<T, U> = T extends object ? (U extends object ? (TWithout<T, U> & U) | (TWithout<U, T> & T) : U) : T;

/**
 * A human-readable duration used for timeout configuration throughout the
 * library (callback waits, idle state timeouts, retry delays, etc.).
 *
 * At least one field should be set. Fields are additive when the consuming
 * code converts them — e.g. `{ minutes: 1, seconds: 30 }` = 90 seconds.
 */
export interface Duration {
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/**
 * User-supplied function that validates a payload against a schema.
 *
 * The framework is schema-library agnostic — this function bridges the gap
 * between the schema passed to `@Payload(schema)` and the validation library
 * of your choice (Zod, Joi, class-validator, etc.).
 *
 * @param schema - The schema object passed to `@Payload(schema)` by the handler author.
 * @param payload - The raw incoming payload to validate.
 * @returns The validated (and possibly transformed) payload. This value replaces
 *   the raw payload in the handler's arguments.
 * @throws Should throw if validation fails — the framework wraps the error in a
 *   `BadRequestException`.
 *
 * @example
 * ```typescript
 * // Zod
 * const payloadValidator: PayloadValidator = (schema, payload) =>
 *   (schema as z.ZodSchema).parse(payload);
 *
 * // Joi
 * const payloadValidator: PayloadValidator = (schema, payload) => {
 *   const { value, error } = (schema as Joi.Schema).validate(payload);
 *   if (error) throw error;
 *   return value;
 * };
 * ```
 */
export type PayloadValidator = (schema: unknown, payload: unknown) => unknown;

/**
 * NestJS injection token for the optional {@link PayloadValidator} function
 * provided via {@link WorkflowModule.register}.
 */
export const WORKFLOW_PAYLOAD_VALIDATOR = Symbol('WORKFLOW_PAYLOAD_VALIDATOR');
