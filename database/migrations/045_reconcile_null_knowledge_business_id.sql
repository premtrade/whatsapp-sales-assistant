-- Repair the single legacy knowledge document left unassigned after the
-- multi-tenant baseline. This is intentionally guarded by the live inventory:
-- Garco must still be the only tenant and exactly one knowledge row may be
-- unassigned; all other tenant-owned tables must already be fully assigned.
SET search_path TO public;

DO $$
DECLARE
  tenant_count BIGINT;
  garco_id UUID;
  unassigned_knowledge_count BIGINT;
BEGIN
  -- Keep the verified single-tenant state stable until the guarded repair ends.
  LOCK TABLE businesses, contacts, conversations, products, knowledge_documents,
    quotes, appointments, handoffs IN SHARE MODE;

  SELECT COUNT(*) INTO tenant_count FROM businesses WHERE deleted_at IS NULL;
  SELECT id INTO garco_id
  FROM businesses
  WHERE slug = 'garco' AND deleted_at IS NULL;

  IF tenant_count <> 1 OR garco_id IS NULL THEN
    RAISE EXCEPTION
      'Refusing legacy knowledge repair: expected Garco as the only business; found % businesses',
      tenant_count;
  END IF;

  SELECT COUNT(*) INTO unassigned_knowledge_count
  FROM knowledge_documents WHERE business_id IS NULL;

  IF unassigned_knowledge_count <> 1 THEN
    RAISE EXCEPTION
      'Refusing legacy knowledge repair: expected exactly one unassigned knowledge document; found %',
      unassigned_knowledge_count;
  END IF;

  IF EXISTS (SELECT 1 FROM contacts WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM conversations WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM products WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM quotes WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM appointments WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM handoffs WHERE business_id IS NULL) THEN
    RAISE EXCEPTION
      'Refusing legacy knowledge repair: another tenant-owned table contains unassigned rows';
  END IF;

  UPDATE knowledge_documents
  SET business_id = garco_id
  WHERE business_id IS NULL;
END $$;
