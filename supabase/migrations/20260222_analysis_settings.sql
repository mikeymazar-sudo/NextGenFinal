-- Analysis settings table for user-adjustable assumptions
CREATE TABLE public.analysis_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{
    "mao_percentage": 70,
    "repair_buffer_percentage": 0,
    "holding_months": 3,
    "holding_cost_monthly": 1500,
    "assignment_fee_target": 10000,
    "vacancy_rate": 8,
    "management_fee": 10,
    "maintenance_reserve": 5,
    "capex_reserve": 5,
    "insurance_annual": 1200,
    "down_payment_percentage": 25,
    "interest_rate": 7.5,
    "loan_term_years": 30,
    "closing_costs_percentage": 3,
    "target_cap_rate": 8,
    "target_cash_on_cash": 10
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.analysis_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON public.analysis_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.analysis_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.analysis_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Add analysis_overrides column to properties for per-deal adjustments
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS analysis_overrides jsonb DEFAULT NULL;

-- Add calculator_scenarios column for Phase 5
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS calculator_scenarios jsonb DEFAULT '[]'::jsonb;

-- Property photos table for Phase 2
CREATE TABLE public.property_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  caption text,
  display_order integer DEFAULT 0,
  vision_assessment jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view photos" ON public.property_photos
  FOR SELECT USING (true);
CREATE POLICY "Users can upload photos" ON public.property_photos
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update photos" ON public.property_photos
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete photos" ON public.property_photos
  FOR DELETE USING (auth.uid() = created_by);

CREATE INDEX idx_property_photos_property_id ON public.property_photos(property_id);

-- Comp images table for Phase 3
CREATE TABLE public.comp_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  comp_address text NOT NULL,
  comp_type text NOT NULL CHECK (comp_type IN ('sold', 'rental')),
  image_type text NOT NULL CHECK (image_type IN ('street_view', 'listing_exterior', 'listing_interior')),
  storage_path text,
  source_url text,
  vision_assessment jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.comp_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comp images" ON public.comp_images
  FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert comp images" ON public.comp_images
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_comp_images_property ON public.comp_images(property_id);
CREATE INDEX idx_comp_images_address ON public.comp_images(comp_address);
