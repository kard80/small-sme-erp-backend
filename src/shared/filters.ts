export class ComparableFilter<T> {
  readonly $eq?: T;
  readonly $gt?: T;
  readonly $gte?: T;
  readonly $lt?: T;
  readonly $lte?: T;
  readonly $ne?: T;

  constructor(input: { $eq?: T; $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T }) {
    const inputLength = Object.keys(input).length;
    if (inputLength === 0) {
      throw new Error('ComparableFilter requires at least one of $eq, $gt, $gte, $lt, $lte');
    }

    if (input.$eq !== undefined && inputLength > 1) {
      throw new Error('ComparableFilter cannot have $eq with other comparison operators');
    } else if (input.$ne !== undefined && inputLength > 1) {
      throw new Error('ComparableFilter cannot have $ne with other comparison operators');
    }

    if (input.$gt !== undefined && input.$gte !== undefined) {
      throw new Error('ComparableFilter cannot have both $gt and $gte');
    }

    if (input.$lt !== undefined && input.$lte !== undefined) {
      throw new Error('ComparableFilter cannot have both $lt and $lte');
    }

    Object.assign(this, input);
  }

  toMongoOperator(): Record<string, T> | T {
    if (this.$eq !== undefined) return this.$eq;

    const operators: Record<string, T> = {};
    if (this.$gt !== undefined) operators.$gt = this.$gt;
    if (this.$gte !== undefined) operators.$gte = this.$gte;
    if (this.$lt !== undefined) operators.$lt = this.$lt;
    if (this.$lte !== undefined) operators.$lte = this.$lte;
    if (this.$ne !== undefined) operators.$ne = this.$ne;

    return operators;
  }
}
