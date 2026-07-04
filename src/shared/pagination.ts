/**
 * for Repository pagination
 */
export class Pagination {
  readonly page?: number;
  readonly pageSize?: number;

  constructor(page?: number, pageSize?: number) {
    if (page === undefined && pageSize === undefined) {
      return;
    } else if (page === undefined || pageSize === undefined) {
      throw new Error('Pagination requires either both page and pageSize or neither');
    }

    if (page < 1) {
      throw new Error('Pagination page must be greater than 0');
    }

    if (pageSize < 1) {
      throw new Error('Pagination pageSize must be greater than 0');
    }

    this.page = page;
    this.pageSize = pageSize;
  }

  get skip(): number | undefined {
    if (this.page === undefined || this.pageSize === undefined) {
      return undefined;
    }

    return (this.page - 1) * this.pageSize;
  }

}

/**
 * for API response pagination meta
 */
export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
};
