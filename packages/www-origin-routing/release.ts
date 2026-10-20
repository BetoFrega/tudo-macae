/** Runtime service and revision names (`K_SERVICE`, `K_REVISION`). */
export const isRuntimeName = (value: string) => /^[a-z][a-z0-9-]{0,62}$/u.test(value);
