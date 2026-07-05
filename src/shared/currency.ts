export class Currency {
  readonly baht: number;

  constructor(baht: number) {
    this.baht = baht;
  }

  add(input: Currency): Currency {
    const sum = Math.round((this.baht + input.baht) * 100) / 100;
    return new Currency(sum);
  }

  toNumber(): number {
    return this.baht;
  }
}
