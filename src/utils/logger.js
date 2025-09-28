// Simple timestamped logger wrappers
export const log = (...args) => console.log(new Date().toISOString(), '-', ...args);
export const warn = (...args) => console.warn(new Date().toISOString(), '- WARN -', ...args);
export const error = (...args) => console.error(new Date().toISOString(), '- ERROR -', ...args);
