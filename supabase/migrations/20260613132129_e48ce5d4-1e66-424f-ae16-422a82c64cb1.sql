
-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone_number TEXT,
  college_name TEXT NOT NULL DEFAULT 'ABV-IIITM Gwalior',
  hostel_block TEXT NOT NULL DEFAULT 'BH-2',
  room_number TEXT NOT NULL DEFAULT '412',
  wing_label TEXT NOT NULL DEFAULT 'Wing 4B',
  monthly_allowance INTEGER NOT NULL DEFAULT 800000,
  cycle_start_day INTEGER NOT NULL DEFAULT 1 CHECK (cycle_start_day BETWEEN 1 AND 28),
  exam_start_date DATE,
  exam_end_date DATE,
  upi_apps_used TEXT[] NOT NULL DEFAULT '{}',
  mess_enrolled BOOLEAN NOT NULL DEFAULT false,
  meal_schedule JSONB,
  companion_paired BOOLEAN NOT NULL DEFAULT false,
  companion_device_name TEXT,
  companion_last_sync TIMESTAMPTZ,
  pairing_code TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- TRANSACTIONS
-- =========================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  raw_merchant_string TEXT NOT NULL,
  mapped_merchant_name TEXT,
  category TEXT CHECK (category IN ('food','stationery','travel','recharge','subscription','entertainment','other')),
  is_mapped BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','companion_sms','companion_notification','webhook')),
  raw_notification_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_user_created ON public.transactions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "txn_select_own" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "txn_insert_own" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "txn_update_own" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "txn_delete_own" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- MERCHANT DIRECTORY
-- =========================
CREATE TABLE public.merchant_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_string TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  campus TEXT NOT NULL DEFAULT 'ABV-IIITM Gwalior',
  mapped_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmation_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.merchant_directory TO authenticated;
GRANT ALL ON public.merchant_directory TO service_role;
ALTER TABLE public.merchant_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "md_read_all" ON public.merchant_directory FOR SELECT TO authenticated USING (true);
CREATE POLICY "md_insert_auth" ON public.merchant_directory FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "md_update_auth" ON public.merchant_directory FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- =========================
-- CAMPUS FOOD OPTIONS
-- =========================
CREATE TABLE public.campus_food_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  available_from TIME NOT NULL,
  available_until TIME NOT NULL,
  campus TEXT NOT NULL DEFAULT 'ABV-IIITM Gwalior',
  is_active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.campus_food_options TO authenticated;
GRANT ALL ON public.campus_food_options TO service_role;
ALTER TABLE public.campus_food_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfo_read_all" ON public.campus_food_options FOR SELECT TO authenticated USING (true);

-- Seed campus food
INSERT INTO public.campus_food_options (venue_name, item_name, price, available_from, available_until) VALUES
('BH-1 Mess Hall','Breakfast Thali',5000,'07:30','09:30'),
('BH-1 Mess Hall','Lunch Thali',6000,'12:00','14:00'),
('BH-1 Mess Hall','Dinner Thali',6000,'19:30','21:30'),
('BH-2 Night Canteen','Maggi',3000,'20:00','02:00'),
('BH-2 Night Canteen','Egg Paratha',4500,'20:00','02:00'),
('BH-2 Night Canteen','Chai',1500,'20:00','02:00'),
('BH-2 Night Canteen','Bread Omelette',3500,'20:00','02:00'),
('Campus Café','Samosa (2pc)',2000,'10:00','22:00'),
('Campus Café','Chole Bhature',7000,'11:00','15:00'),
('Campus Café','Cold Coffee',4000,'10:00','22:00'),
('Gate Dhaba','Egg Rice',6000,'11:00','23:00'),
('Gate Dhaba','Paneer Roll',5000,'11:00','23:00'),
('Gate Dhaba','Lemon Soda',2000,'11:00','23:00'),
('Night Juice Corner','Banana Shake',3500,'19:00','01:00'),
('Night Juice Corner','Mixed Fruit',4500,'19:00','01:00');

-- =========================
-- CART POOLS
-- =========================
CREATE TABLE public.cart_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by_name TEXT NOT NULL DEFAULT '',
  wing_label TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('blinkit','zepto','swiggy_instamart')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','completed','expired')),
  min_cart_value INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pool_wing_status ON public.cart_pools (wing_label, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_pools TO authenticated;
GRANT ALL ON public.cart_pools TO service_role;
ALTER TABLE public.cart_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pool_select_all" ON public.cart_pools FOR SELECT TO authenticated USING (true);
CREATE POLICY "pool_insert_own" ON public.cart_pools FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "pool_update_own" ON public.cart_pools FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE TABLE public.cart_pool_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES public.cart_pools(id) ON DELETE CASCADE,
  added_by_name TEXT NOT NULL,
  item_description TEXT NOT NULL,
  estimated_price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pool_items_pool ON public.cart_pool_items (pool_id);
GRANT SELECT, INSERT, DELETE ON public.cart_pool_items TO authenticated;
GRANT ALL ON public.cart_pool_items TO service_role;
ALTER TABLE public.cart_pool_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_select_all" ON public.cart_pool_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "pi_insert_auth" ON public.cart_pool_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- =========================
-- SUBSCRIPTIONS
-- =========================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  next_debit_date DATE NOT NULL,
  detected_from TEXT NOT NULL DEFAULT 'manual' CHECK (detected_from IN ('manual','auto_detected')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_select_own" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sub_insert_own" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sub_update_own" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sub_delete_own" ON public.subscriptions FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- CHECKIN LOGS
-- =========================
CREATE TABLE public.checkin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('ate','skipped')),
  stress_note TEXT,
  food_gap_hours NUMERIC NOT NULL,
  suggestion_given TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.checkin_logs TO authenticated;
GRANT ALL ON public.checkin_logs TO service_role;
ALTER TABLE public.checkin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cl_select_own" ON public.checkin_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cl_insert_own" ON public.checkin_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =========================
-- COMPANION SYNC LOG
-- =========================
CREATE TABLE public.companion_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  notification_source TEXT NOT NULL,
  raw_body TEXT NOT NULL,
  parsed_amount INTEGER,
  parsed_merchant TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','parsed','failed','duplicate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_user_created ON public.companion_sync_log (user_id, created_at DESC);
GRANT SELECT ON public.companion_sync_log TO authenticated;
GRANT ALL ON public.companion_sync_log TO service_role;
ALTER TABLE public.companion_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "csl_select_own" ON public.companion_sync_log FOR SELECT USING (auth.uid() = user_id);

-- =========================
-- REALTIME
-- =========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_pools;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_pool_items;
