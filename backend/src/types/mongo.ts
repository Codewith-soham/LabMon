// Mongoose 9 tightened its query-filter type (`QueryFilter<T>`) and no longer
// exports it, so a filter assembled from dynamic keys (dotted config paths, the
// department scope spread in) can't be spelled with a library type. This alias
// is the shape our scope helpers and the PC search-filter builder produce and
// hand to `Model.find` / `Model.findOne`.
export type MongoFilter = Record<string, unknown>;
