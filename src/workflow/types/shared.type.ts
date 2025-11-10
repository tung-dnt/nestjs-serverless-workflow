export type TWithout<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

// Either is needed to have a real mutually exclusive union type
export type TEither<T, U> = T extends object ? (U extends object ? (TWithout<T, U> & U) | (TWithout<U, T> & T) : U) : T;
