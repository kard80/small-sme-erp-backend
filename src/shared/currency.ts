export class Currency {
  readonly baht: number;

  constructor(baht: number) {
    this.baht = baht;
  }

  add(input: Currency): Currency {
    const sum = Math.round((this.baht + input.baht) * 100) / 100;
    return new Currency(sum);
  }

  multiply(factor: number): Currency {
    const product = Math.round(this.baht * factor * 100) / 100;
    return new Currency(product);
  }

  toNumber(): number {
    return this.baht;
  }
}
