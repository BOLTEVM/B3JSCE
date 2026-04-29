export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export interface Order {
  id: string;
  price: bigint;
  amount: bigint;
  side: OrderSide;
  timestamp: number;
  userId: string;
  marketId: string;
}

export interface Trade {
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  price: bigint;
  amount: bigint;
  timestamp: number;
  side: OrderSide;
  marketId: string;
}

export interface BookUpdate {
    type: 'ADD' | 'DELETE' | 'UPDATE';
    side: OrderSide;
    order: Order;
    marketId: string;
}

export interface MatchResult {
    trades: Trade[];
    updates: BookUpdate[];
}

/**
 * TreapNode: Randomized BST node for O(log N) orderbook operations.
 */
class TreapNode {
  public priority: number;
  public left: TreapNode | null = null;
  public right: TreapNode | null = null;

  constructor(public order: Order) {
    this.priority = Math.random();
  }
}

/**
 * Treap: Maintains orders sorted by Price-Time priority.
 */
class Treap {
  public root: TreapNode | null = null;

  constructor(private isBid: boolean) {}

  private isMoreImportant(a: Order, b: Order): boolean {
    if (this.isBid) {
      if (a.price > b.price) return true;
      if (a.price < b.price) return false;
    } else {
      if (a.price < b.price) return true;
      if (a.price > b.price) return false;
    }
    return a.timestamp < b.timestamp;
  }

  public insert(order: Order) {
    this.root = this._insert(this.root, order);
  }

  private _insert(node: TreapNode | null, order: Order): TreapNode {
    if (!node) return new TreapNode(order);

    if (this.isMoreImportant(order, node.order)) {
      node.left = this._insert(node.left, order);
      if (node.left.priority > node.priority) node = this._rotateRight(node);
    } else {
      node.right = this._insert(node.right, order);
      if (node.right.priority > node.priority) node = this._rotateLeft(node);
    }
    return node;
  }

  private _rotateRight(y: TreapNode): TreapNode {
    const x = y.left!;
    y.left = x.right;
    x.right = y;
    return x;
  }

  private _rotateLeft(x: TreapNode): TreapNode {
    const y = x.right!;
    x.right = y.left;
    y.left = x;
    return y;
  }

  public getBest(): Order | null {
    if (!this.root) return null;
    let curr = this.root;
    while (curr.left) curr = curr.left;
    return curr.order;
  }

  public removeBest() {
    if (!this.root) return;
    const best = this.getBest()!;
    this.delete(best.id);
  }

  public delete(orderId: string) {
    this.root = this._delete(this.root, orderId);
  }

  private _delete(node: TreapNode | null, orderId: string): TreapNode | null {
    if (!node) return null;
    if (node.order.id === orderId) {
      if (!node.left) return node.right;
      if (!node.right) return node.left;
      if (node.left.priority > node.right.priority) {
        node = this._rotateRight(node);
        node.right = this._delete(node.right, orderId);
      } else {
        node = this._rotateLeft(node);
        node.left = this._delete(node.left, orderId);
      }
    } else {
      node.left = this._delete(node.left, orderId);
      node.right = this._delete(node.right, orderId);
    }
    return node;
  }

  public toArray(): Order[] {
    const arr: Order[] = [];
    this._inOrder(this.root, arr);
    return arr;
  }

  private _inOrder(node: TreapNode | null, arr: Order[]) {
    if (!node) return;
    this._inOrder(node.left, arr);
    arr.push(node.order);
    this._inOrder(node.right, arr);
  }
}

/**
 * OrderBook: Local matching engine for a single trading pair.
 */
export class OrderBook {
  private bids = new Treap(true);
  private asks = new Treap(false);
  private orderIndex: Map<string, OrderSide> = new Map();

  constructor(public marketId: string) {}

  public addOrder(order: Order): MatchResult {
    const trades: Trade[] = [];
    const updates: BookUpdate[] = [];

    if (order.side === OrderSide.BUY) {
      while (true) {
        const bestAsk = this.asks.getBest();
        if (!bestAsk || order.amount <= 0n || order.price < bestAsk.price) break;

        const matchAmount = order.amount < bestAsk.amount ? order.amount : bestAsk.amount;

        trades.push({
          makerOrderId: bestAsk.id,
          takerOrderId: order.id,
          makerUserId: bestAsk.userId,
          takerUserId: order.userId,
          price: bestAsk.price,
          amount: matchAmount,
          timestamp: Date.now(),
          side: OrderSide.BUY,
          marketId: this.marketId
        });

        order.amount -= matchAmount;
        bestAsk.amount -= matchAmount;

        if (bestAsk.amount === 0n) {
          this.asks.removeBest();
          this.orderIndex.delete(bestAsk.id);
          updates.push({ type: 'DELETE', side: OrderSide.SELL, order: bestAsk, marketId: this.marketId });
        } else {
          updates.push({ type: 'UPDATE', side: OrderSide.SELL, order: bestAsk, marketId: this.marketId });
        }
      }

      if (order.amount > 0n) {
        this.bids.insert(order);
        this.orderIndex.set(order.id, OrderSide.BUY);
        updates.push({ type: 'ADD', side: OrderSide.BUY, order, marketId: this.marketId });
      }
    } else {
      while (true) {
        const bestBid = this.bids.getBest();
        if (!bestBid || order.amount <= 0n || order.price > bestBid.price) break;

        const matchAmount = order.amount < bestBid.amount ? order.amount : bestBid.amount;

        trades.push({
          makerOrderId: bestBid.id,
          takerOrderId: order.id,
          makerUserId: bestBid.userId,
          takerUserId: order.userId,
          price: bestBid.price,
          amount: matchAmount,
          timestamp: Date.now(),
          side: OrderSide.SELL,
          marketId: this.marketId
        });

        order.amount -= matchAmount;
        bestBid.amount -= matchAmount;

        if (bestBid.amount === 0n) {
          this.bids.removeBest();
          this.orderIndex.delete(bestBid.id);
          updates.push({ type: 'DELETE', side: OrderSide.BUY, order: bestBid, marketId: this.marketId });
        } else {
          updates.push({ type: 'UPDATE', side: OrderSide.BUY, order: bestBid, marketId: this.marketId });
        }
      }

      if (order.amount > 0n) {
        this.asks.insert(order);
        this.orderIndex.set(order.id, OrderSide.SELL);
        updates.push({ type: 'ADD', side: OrderSide.SELL, order, marketId: this.marketId });
      }
    }

    return { trades, updates };
  }

  public cancelOrder(orderId: string): BookUpdate[] {
    const side = this.orderIndex.get(orderId);
    if (side === undefined) return [];

    const book = side === OrderSide.BUY ? this.bids : this.asks;
    const order = book.toArray().find(o => o.id === orderId);
    
    if (order) {
      book.delete(orderId);
      this.orderIndex.delete(orderId);
      return [{ type: 'DELETE', side, order, marketId: this.marketId }];
    }
    return [];
  }

  public getSnapshot() {
    return {
      bids: this.bids.toArray(),
      asks: this.asks.toArray()
    };
  }
}

export interface VendorStock {
  itemId: string;
  price: bigint;
  quantity: number;
  unlimited?: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  stock: VendorStock[];
}

/**
 * EconomyManager: Orchestrates markets, vendors, and dispatches trade events.
 */
export class EconomyManager {
  private markets: Map<string, OrderBook> = new Map();
  private vendors: Map<string, Vendor> = new Map();
  private onTradeListeners: ((trade: Trade) => void)[] = [];

  constructor(private engine: any) {}

  public registerVendor(vendor: Vendor) {
    this.vendors.set(vendor.id, vendor);
    console.log(`[ECONOMY] Vendor Registered: ${vendor.name} (${vendor.id})`);
  }

  public getVendor(id: string): Vendor | undefined {
    return this.vendors.get(id);
  }

  public getOrCreateMarket(marketId: string): OrderBook {
    let book = this.markets.get(marketId);
    if (!book) {
      book = new OrderBook(marketId);
      this.markets.set(marketId, book);
    }
    return book;
  }

  public placeOrder(marketId: string, order: Order): MatchResult {
    const book = this.getOrCreateMarket(marketId);
    const result = book.addOrder(order);
    
    result.trades.forEach(t => {
      this.onTradeListeners.forEach(l => l(t));
      console.log(`[ECONOMY] Trade Executed: ${t.amount} @ ${t.price} on ${t.marketId}`);
    });

    return result;
  }

  public cancelOrder(marketId: string, orderId: string): BookUpdate[] {
    const book = this.markets.get(marketId);
    if (!book) return [];
    return book.cancelOrder(orderId);
  }

  public onTrade(callback: (trade: Trade) => void) {
    this.onTradeListeners.push(callback);
  }
}
