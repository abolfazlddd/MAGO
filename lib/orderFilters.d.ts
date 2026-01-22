export function filterOrders<T extends any>(
  orders: T[],
  opts: {
    status?: string;
    q?: string;
    createdFrom?: string;
    createdTo?: string;
    hideCancelled?: boolean;
    sort?: "newest" | "oldest" | "total_desc" | "total_asc";
  }
): T[];

export function ordersToCsv(orders: any[]): string;
