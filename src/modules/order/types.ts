import { ComparableFilter } from '../../shared/filters';
import { Pagination } from '../../shared/pagination';

type OrderSortField = '_id' | 'deliveryDate' | 'deliveryNote';
export type OrderSort = Partial<Record<OrderSortField, 1 | -1>>;
export type ListOrdersProps = {
  where?: {
    _id?: ComparableFilter<string>;
    deliveryDate?: ComparableFilter<Date>;
    customerId?: ComparableFilter<string>;
    deliveryNote?: ComparableFilter<string | null>;
    completedAt?: ComparableFilter<Date | null>;
  };
  pagination: Pagination;
  sort?: OrderSort;
};
