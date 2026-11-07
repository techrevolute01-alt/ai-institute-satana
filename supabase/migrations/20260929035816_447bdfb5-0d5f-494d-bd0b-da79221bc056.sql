CREATE TABLE public.package_includes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  included_package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, included_package_id),
  CHECK (package_id <> included_package_id)
);
GRANT SELECT ON public.package_includes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.package_includes TO authenticated;
GRANT ALL ON public.package_includes TO service_role;
ALTER TABLE public.package_includes ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_includes_read ON public.package_includes FOR SELECT USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.status = 'published')
      AND EXISTS (SELECT 1 FROM public.packages p WHERE p.id = included_package_id AND p.status = 'published'))
);
CREATE POLICY package_includes_admin ON public.package_includes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION private.prevent_package_cycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE r(id) AS (
      SELECT included_package_id FROM public.package_includes WHERE package_id = NEW.included_package_id
      UNION SELECT pi.included_package_id FROM public.package_includes pi JOIN r ON pi.package_id = r.id
    ) SELECT 1 FROM r WHERE id = NEW.package_id
  ) OR NEW.included_package_id = NEW.package_id THEN
    RAISE EXCEPTION 'Circular package inclusion is not allowed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER package_includes_no_cycle BEFORE INSERT OR UPDATE ON public.package_includes
FOR EACH ROW EXECUTE FUNCTION private.prevent_package_cycle();
CREATE INDEX package_includes_included_idx ON public.package_includes(included_package_id);