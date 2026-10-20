CREATE INDEX classifieds_owner_created ON classifieds_records (kind, owner_id, json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC);
CREATE INDEX classifieds_profile_created ON classifieds_records (kind, profile_id, json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC);
CREATE INDEX classifieds_status_created ON classifieds_records (kind, json_extract(body, '$.status'), json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC);
CREATE INDEX classifieds_category_status_created ON classifieds_records (kind, category_id, json_extract(body, '$.status'), json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC);
CREATE INDEX classifieds_subcategory_status_created ON classifieds_records (kind, category_id, json_extract(body, '$.subcategoryId'), json_extract(body, '$.status'), json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC);
