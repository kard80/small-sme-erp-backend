import { ComparableFilter } from '../../shared/filters';
import { Pagination } from '../../shared/pagination';

type OrderSortField = '_id' | 'deliveryDate' | 'deliveryNote';
export type OrderSort = Partial<Record<OrderSortField, 1 | -1>>;
export type ListOrdersProps = {
  where?: {
    deliveryDate?: ComparableFilter<Date>;
    customerId?: ComparableFilter<string>;
    deliveryNote?: ComparableFilter<string | null>;
  };
  pagination: Pagination;
  sort?: OrderSort;
};
