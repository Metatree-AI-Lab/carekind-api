-- careKind API — 行级安全（RLS）与审计只追加（ADR-0006：共享 schema + providerId + RLS + 应用层 guard 双重保护）。
-- 在 `prisma migrate` 建表之后，用表的 owner 连接执行一次：npm run db:rls
-- 可以重复执行（每条语句都先删除再创建）。
--
-- 请求上下文由 API 在每个事务开头用 set_config(..., true)（等同 SET LOCAL）设置：
--   app.provider_id  当前租户（uuid），未设置 = 看不到任何租户数据（默认拒绝）
--   app.audience     'SUPER_ADMIN' 或 'PORTAL'，与 Session.audience 枚举一致
-- 运行时连接必须使用 carekind_app 角色（不是表的 owner，没有 BYPASSRLS），所以策略对它生效。
-- 表的 owner（迁移、种子、下面的 SECURITY DEFINER 计数函数）不受 RLS 约束：故意不用 FORCE ROW LEVEL SECURITY，
-- 这样"只返回计数"的函数才能在不开放住户行的前提下给 Super Admin 计数。

-- ───────── 运行时角色 ─────────
-- 角色不在这里设置密码（rules/02 §7：不硬编码密钥）。执行后由开发者在 psql 里手动执行：
--   ALTER ROLE carekind_app WITH LOGIN PASSWORD '<从密钥管理或 .env 取得>';
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carekind_app') THEN
		CREATE ROLE carekind_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO carekind_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carekind_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carekind_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM carekind_app;

-- ───────── 上下文读取函数 ─────────
CREATE OR REPLACE FUNCTION ck_current_provider() RETURNS uuid
	LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.provider_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION ck_current_audience() RETURNS text
	LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.audience', true), '') $$;

-- ───────── 审计只追加 ─────────
-- 数据库权限层面禁止 UPDATE / DELETE / TRUNCATE；触发器再拦一次，owner 也不能改删（SA §4-N）。
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_event FROM carekind_app;

CREATE OR REPLACE FUNCTION ck_reject_audit_mutation() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_event is append-only';
END
$$;

DROP TRIGGER IF EXISTS audit_event_no_update_delete ON audit_event;
CREATE TRIGGER audit_event_no_update_delete
	BEFORE UPDATE OR DELETE ON audit_event
	FOR EACH ROW EXECUTE FUNCTION ck_reject_audit_mutation();

DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit_event;
CREATE TRIGGER audit_event_no_truncate
	BEFORE TRUNCATE ON audit_event
	FOR EACH STATEMENT EXECUTE FUNCTION ck_reject_audit_mutation();

-- ───────── 可为空列上的唯一约束 ─────────
-- Prisma 的 @@unique 在 NULL 上不去重；平台层（providerId 为空）的版本号和开关覆盖需要 NULLS NOT DISTINCT（PG 15+）。
CREATE UNIQUE INDEX IF NOT EXISTS config_version_unique_nulls
	ON config_version (layer, "providerId", "facilityId", item, "versionNumber") NULLS NOT DISTINCT;
-- 法定名称只在真实 Provider 之间唯一（Demo 克隆同名）。
CREATE UNIQUE INDEX IF NOT EXISTS provider_legal_name_unique_real
	ON provider ("legalName") WHERE NOT "isDemo";
CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_override_unique_nulls
	ON feature_flag_override ("flagKey", scope, state, "providerId", "facilityId") NULLS NOT DISTINCT;

-- ───────── A. 普通租户表：只看本 Provider（Super Admin 进入某个 Provider 时也设置 provider_id） ─────────
DO $$
DECLARE
	tenant_table text;
BEGIN
	FOREACH tenant_table IN ARRAY ARRAY[
		'region', 'plan', 'compliance_status', 'breach_notification_registration',
		'go_live_checklist_item', 'staff_member', 'staff_facility_assignment', 'portal_role_assignment',
		'staff_onboarding_step', 'invitation', 'clinical_role_grant_request'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
		EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tenant_table);
		EXECUTE format(
			'CREATE POLICY tenant_isolation ON %I USING ("providerId" = ck_current_provider()) '
			'WITH CHECK ("providerId" = ck_current_provider())',
			tenant_table
		);
	END LOOP;
END
$$;

-- Facility / Unit 是控制面元数据（名称、地址、州），Super Admin 需要按 facilityId 直接访问（/super-admin/facilities/:id），
-- 所以 SUPER_ADMIN 可以跨 Provider 读取；写入仍必须带正确的 provider_id。
DO $$
DECLARE
	site_table text;
BEGIN
	FOREACH site_table IN ARRAY ARRAY['facility', 'unit']
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', site_table);
		EXECUTE format('DROP POLICY IF EXISTS site_isolation ON %I', site_table);
		EXECUTE format(
			'CREATE POLICY site_isolation ON %I USING ("providerId" = ck_current_provider() '
			'OR ck_current_audience() = ''SUPER_ADMIN'') WITH CHECK ("providerId" = ck_current_provider())',
			site_table
		);
	END LOOP;
END
$$;

-- 支持访问申请：机构只看自己的；Super Admin 可以跨 Provider 列出（申请本身不含健康信息，Support 需要看自己发起的全部申请）。
ALTER TABLE support_access_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_access_isolation ON support_access_request;
CREATE POLICY support_access_isolation ON support_access_request
	USING ("providerId" = ck_current_provider() OR ck_current_audience() = 'SUPER_ADMIN')
	WITH CHECK ("providerId" = ck_current_provider());

-- ───────── B. 住户相关表：只允许机构管理端（PORTAL）访问；Super Admin 即使设置了 provider_id 也读不到 ─────────
-- 支持访问（SA §4-M）在第一阶段只做元数据级，不开放住户内容，所以这里不为支持会话开例外。
DO $$
DECLARE
	resident_table text;
BEGIN
	FOREACH resident_table IN ARRAY ARRAY[
		'resident', 'resident_location_event', 'resident_consent_event', 'resident_contact',
		'resident_transfer', 'roster_import_batch', 'roster_import_row'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', resident_table);
		EXECUTE format('DROP POLICY IF EXISTS portal_tenant_isolation ON %I', resident_table);
		EXECUTE format(
			'CREATE POLICY portal_tenant_isolation ON %I '
			'USING ("providerId" = ck_current_provider() AND ck_current_audience() = ''PORTAL'') '
			'WITH CHECK ("providerId" = ck_current_provider() AND ck_current_audience() = ''PORTAL'')',
			resident_table
		);
	END LOOP;
END
$$;

-- ───────── C. provider 表：Portal 只看自己；Super Admin 可列出全部，只有 Super Admin 能新建 ─────────
ALTER TABLE provider ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_read ON provider;
DROP POLICY IF EXISTS provider_insert ON provider;
DROP POLICY IF EXISTS provider_update ON provider;
CREATE POLICY provider_read ON provider FOR SELECT
	USING (id = ck_current_provider() OR ck_current_audience() = 'SUPER_ADMIN');
CREATE POLICY provider_insert ON provider FOR INSERT
	WITH CHECK (ck_current_audience() = 'SUPER_ADMIN');
CREATE POLICY provider_update ON provider FOR UPDATE
	USING (ck_current_audience() = 'SUPER_ADMIN' OR id = ck_current_provider())
	WITH CHECK (ck_current_audience() = 'SUPER_ADMIN' OR id = ck_current_provider());

-- ───────── D. 平台层 + 租户层混合表：providerId 为空 = careKind 平台层，所有人可读，只有 Super Admin 可写 ─────────
DO $$
DECLARE
	layered_table text;
BEGIN
	FOREACH layered_table IN ARRAY ARRAY['config_version', 'feature_flag_override']
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', layered_table);
		EXECUTE format('DROP POLICY IF EXISTS layered_read ON %I', layered_table);
		EXECUTE format('DROP POLICY IF EXISTS layered_write ON %I', layered_table);
		EXECUTE format(
			'CREATE POLICY layered_read ON %I FOR SELECT '
			'USING ("providerId" IS NULL OR "providerId" = ck_current_provider() OR ck_current_audience() = ''SUPER_ADMIN'')',
			layered_table
		);
		EXECUTE format(
			'CREATE POLICY layered_write ON %I FOR ALL '
			'USING (("providerId" IS NULL AND ck_current_audience() = ''SUPER_ADMIN'') OR "providerId" = ck_current_provider()) '
			'WITH CHECK (("providerId" IS NULL AND ck_current_audience() = ''SUPER_ADMIN'') OR "providerId" = ck_current_provider())',
			layered_table
		);
	END LOOP;
END
$$;

-- ───────── E. 只给 Super Admin 的控制面表 ─────────
DO $$
DECLARE
	control_table text;
BEGIN
	FOREACH control_table IN ARRAY ARRAY[
		'super_admin_user', 'permission_group', 'super_admin_group_membership', 'approval_request'
	]
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', control_table);
		EXECUTE format('DROP POLICY IF EXISTS super_admin_only ON %I', control_table);
		EXECUTE format(
			'CREATE POLICY super_admin_only ON %I '
			'USING (ck_current_audience() = ''SUPER_ADMIN'') WITH CHECK (ck_current_audience() = ''SUPER_ADMIN'')',
			control_table
		);
	END LOOP;
END
$$;

-- ───────── F. 平台发布的内容和设置：PORTAL 只能读已发布内容，只有 Super Admin 可写 ─────────
DO $$
DECLARE
	content_table text;
BEGIN
	FOREACH content_table IN ARRAY ARRAY['state_rule_pack', 'document_template_version']
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', content_table);
		EXECUTE format('DROP POLICY IF EXISTS content_read ON %I', content_table);
		EXECUTE format('DROP POLICY IF EXISTS content_write ON %I', content_table);
		EXECUTE format(
			'CREATE POLICY content_read ON %I FOR SELECT USING (ck_current_audience() = ''SUPER_ADMIN'' '
			'OR (ck_current_audience() = ''PORTAL'' AND status IN (''Published'', ''Deprecated'')))',
			content_table
		);
		EXECUTE format(
			'CREATE POLICY content_write ON %I FOR ALL USING (ck_current_audience() = ''SUPER_ADMIN'') '
			'WITH CHECK (ck_current_audience() = ''SUPER_ADMIN'')',
			content_table
		);
	END LOOP;

	FOREACH content_table IN ARRAY ARRAY['feature_flag', 'platform_setting']
	LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', content_table);
		EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', content_table);
		EXECUTE format('DROP POLICY IF EXISTS platform_write ON %I', content_table);
		EXECUTE format(
			'CREATE POLICY platform_read ON %I FOR SELECT USING (ck_current_audience() IN (''SUPER_ADMIN'', ''PORTAL''))',
			content_table
		);
		EXECUTE format(
			'CREATE POLICY platform_write ON %I FOR ALL USING (ck_current_audience() = ''SUPER_ADMIN'') '
			'WITH CHECK (ck_current_audience() = ''SUPER_ADMIN'')',
			content_table
		);
	END LOOP;
END
$$;

-- ───────── G. 会话：按 audience 隔离；Portal 会话还要求 providerId 与上下文一致 ─────────
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_by_audience ON session;
CREATE POLICY session_by_audience ON session
	USING (
		(audience = 'SUPER_ADMIN' AND ck_current_audience() = 'SUPER_ADMIN')
		OR (audience = 'PORTAL' AND ck_current_audience() = 'PORTAL' AND "providerId" = ck_current_provider())
	)
	WITH CHECK (
		(audience = 'SUPER_ADMIN' AND ck_current_audience() = 'SUPER_ADMIN')
		OR (audience = 'PORTAL' AND ck_current_audience() = 'PORTAL' AND "providerId" = ck_current_provider())
	);

-- ───────── H. 审计：Portal 只能读写本 Provider 的事件；Super Admin（含只读审计员）可以读写全部
-- （SA PRD §4-C：Security Auditor 查看全部审计；Super Admin 在控制面操作某个 Provider 时要写该 Provider 的审计链）。
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read ON audit_event;
DROP POLICY IF EXISTS audit_insert ON audit_event;
CREATE POLICY audit_read ON audit_event FOR SELECT
	USING ("providerId" = ck_current_provider() OR ck_current_audience() = 'SUPER_ADMIN');
CREATE POLICY audit_insert ON audit_event FOR INSERT
	WITH CHECK ("providerId" = ck_current_provider() OR ck_current_audience() = 'SUPER_ADMIN');

-- ───────── I. Super Admin 只能拿到住户"计数"（SA §11.2：Super Admin 只看到计数） ─────────
-- 住户表对 SUPER_ADMIN audience 不可见；这个函数以 owner 身份执行，只返回一个数字，不返回任何行。
-- search_path 固定，防止被同名对象劫持。
CREATE OR REPLACE FUNCTION ck_resident_count(target_provider uuid) RETURNS bigint
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
	SELECT count(*) FROM resident
	WHERE "providerId" = target_provider AND status IN ('PreAdmission', 'Admitted', 'OnLeave', 'InHospital')
$$;
REVOKE ALL ON FUNCTION ck_resident_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ck_resident_count(uuid) TO carekind_app;

-- ───────── J. 门户登录前按邮箱找账号 ─────────
-- 登录时还不知道租户（同一邮箱在两家 Provider = 两个独立账号）。这个函数只返回 (providerId, staffId)，
-- 不返回密码哈希或其他字段；API 拿到后再在对应租户的 RLS 上下文里校验密码。
CREATE OR REPLACE FUNCTION ck_find_portal_logins(login_email text)
	RETURNS TABLE (provider_id uuid, staff_id uuid)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
	SELECT s."providerId", s.id FROM staff_member s
	JOIN provider p ON p.id = s."providerId"
	WHERE lower(s."loginEmail") = lower(login_email)
		AND s.status IN ('Onboarding', 'Active')
		AND s."passwordHash" IS NOT NULL
		AND p.status IN ('Onboarding', 'Active', 'Suspended', 'Terminating')
$$;
REVOKE ALL ON FUNCTION ck_find_portal_logins(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ck_find_portal_logins(text) TO carekind_app;
