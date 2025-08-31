export interface EntityService<T, State> {
  /**
   * Creates a new instance of the entity
   * @returns A new entity instance
   */
  new (): Promise<T>;

  /**
   * Updates the status of an entity
   * @param entity The entity to update
   * @param status The new status
   * @returns The updated entity
   */
  update(entity: T, status: State): Promise<T>;

  /**
   * Loads an entity by its URN
   * @param urn The unique resource name of the entity
   * @returns The loaded entity
   */
  load(urn: string): Promise<T | null>;

  /**
   * Gets the current status of an entity
   * @param entity The entity
   * @returns The current status
   */
  status(entity: T): State;

  /**
   * Gets the URN of an entity
   * @param entity The entity
   * @returns The entity's URN
   */
  urn(entity: T): string;
}
