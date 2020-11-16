export default class BidiMultiMap<A, B> {
  private readonly aToBs: Map<A, Set<B>> = new Map();
  private readonly bToAs: Map<B, Set<A>> = new Map();

  public clear(): void {
    this.aToBs.clear();
    this.bToAs.clear();
  }

  public link(a: A, b: B): void {
    let bSet = this.aToBs.get(a);
    if (bSet === undefined) {
      bSet = new Set();
      this.aToBs.set(a, bSet);
    }
    bSet.add(b);

    let aSet = this.bToAs.get(b);
    if (aSet === undefined) {
      aSet = new Set();
      this.bToAs.set(b, aSet);
    }
    aSet.add(a);
  }

  public unlink(a: A, b: B): void {
    this.removeBFromAToBs(a, b);
    this.removeAFromBToAs(a, b);
  }

  public getA(a: A): B[] {
    const bSet = this.aToBs.get(a);
    if (bSet === undefined) {
      throw new Error(`No such 'A' element (${a})`);
    }
    return [...bSet];
  }

  public getB(b: B): A[] {
    const aSet = this.bToAs.get(b);
    if (aSet === undefined) {
      throw new Error(`No such 'B' element (${b})`);
    }
    return [...aSet];
  }

  public containsA(a: A): boolean {
    return this.aToBs.has(a);
  }

  public containsB(b: B): boolean {
    return this.bToAs.has(b);
  }

  public deleteA(a: A): void {
    const bSet = this.aToBs.get(a);
    if (bSet === undefined) {
      throw new Error(`Failed to delete untracked 'A' (${a})`);
    }
    this.aToBs.delete(a);

    for (const b of bSet) {
      this.removeAFromBToAs(a, b);
    }
  }

  public deleteB(b: B): void {
    const aSet = this.bToAs.get(b);
    if (aSet === undefined) {
      throw new Error(`Failed to delete untracked 'B' (${b})`);
    }
    this.bToAs.delete(b);

    for (const a of aSet) {
      this.removeBFromAToBs(a, b);
    }
  }

  private removeBFromAToBs(a: A, b: B): void {
    const bSet = this.aToBs.get(a);
    if (bSet === undefined) {
      throw new Error(`Failed to remove 'B' (${b}) from untracked 'A' (${a})`);
    } else if (!bSet.has(b)) {
      throw new Error(`Failed to remove untracked 'B' (${b}) from 'A' (${a})`);
    }
    bSet.delete(b);

    if (bSet.size === 0) {
      this.aToBs.delete(a);
    }
  }

  private removeAFromBToAs(a: A, b: B): void {
    const aSet = this.bToAs.get(b);
    if (aSet === undefined) {
      throw new Error(`Failed to remove 'A' (${a}) from untracked 'B' (${b})`);
    } else if (!aSet.has(a)) {
      throw new Error(`Failed to remove untracked 'A' (${a}) from 'B' (${b})`);
    }
    aSet.delete(a);

    if (aSet.size === 0) {
      this.bToAs.delete(b);
    }
  }
}
