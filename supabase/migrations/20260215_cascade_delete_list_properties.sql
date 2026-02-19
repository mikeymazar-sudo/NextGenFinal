-- Change properties.list_id FK from SET NULL to CASCADE
-- When a lead_list is deleted, all properties in that list are also deleted
ALTER TABLE properties
  DROP CONSTRAINT properties_list_id_fkey,
  ADD CONSTRAINT properties_list_id_fkey
    FOREIGN KEY (list_id) REFERENCES lead_lists(id) ON DELETE CASCADE;

-- Change calls.property_id FK from NO ACTION to SET NULL
-- So call records aren't lost but don't block property deletion
ALTER TABLE calls
  DROP CONSTRAINT calls_property_id_fkey,
  ADD CONSTRAINT calls_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
