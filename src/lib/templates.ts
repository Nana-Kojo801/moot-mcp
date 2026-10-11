// Theatrical lines are templated in code with tiny random variation,
// so no AI calls are spent on them.

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const ORDER = ["Order!", "Order, order!", "The House will come to order."] as const;

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function rollCall(ayes: number, nays: number, abstains: number): string {
  const abst = abstains > 0 ? `, with ${abstains} abstaining` : "";
  return `${pick(ORDER)} The ayes, ${ayes}. The noes, ${nays}${abst}.`;
}
