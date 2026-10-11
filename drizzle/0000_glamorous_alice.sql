CREATE TABLE `asset_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`target_amount` integer,
	`target_months_of_expenses` integer,
	`loss_limit_bp` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_accounts_kind_unique` ON `asset_accounts` (`kind`);--> statement-breakpoint
CREATE TABLE `asset_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`type` text NOT NULL,
	`trade_date` text NOT NULL,
	`month` text NOT NULL,
	`symbol` text,
	`quantity_e6` integer,
	`price_per_unit` integer,
	`fee` integer DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `asset_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_transactions_account_idx` ON `asset_transactions` (`account_id`,`trade_date`);--> statement-breakpoint
CREATE INDEX `asset_transactions_month_idx` ON `asset_transactions` (`month`);--> statement-breakpoint
CREATE TABLE `asset_valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`as_of_date` text NOT NULL,
	`price_per_unit` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `asset_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_valuations_symbol_idx` ON `asset_valuations` (`symbol`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `budget_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`group_key` text NOT NULL,
	`asset_kind` text,
	`method` text DEFAULT 'fixed' NOT NULL,
	`fixed_amount` integer DEFAULT 0 NOT NULL,
	`percent_bp` integer DEFAULT 0 NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_categories_slug_unique` ON `budget_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `financial_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`account_kind` text,
	`target_amount` integer NOT NULL,
	`target_month` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_actuals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`category_id` integer NOT NULL,
	`actual_amount` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `budget_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_actuals_uq` ON `monthly_actuals` (`month`,`category_id`);--> statement-breakpoint
CREATE TABLE `monthly_budget_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monthly_budget_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`planned_amount` integer NOT NULL,
	`rule_snapshot` text NOT NULL,
	FOREIGN KEY (`monthly_budget_id`) REFERENCES `monthly_budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `budget_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budget_items_uq` ON `monthly_budget_items` (`monthly_budget_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `monthly_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`salary_amount` integer NOT NULL,
	`salary_change_id` integer,
	`status` text DEFAULT 'projected' NOT NULL,
	`locked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`salary_change_id`) REFERENCES `salary_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_month_uq` ON `monthly_budgets` (`month`);--> statement-breakpoint
CREATE TABLE `projection_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`stock_annual_bp` integer DEFAULT 0 NOT NULL,
	`crypto_annual_bp` integer DEFAULT 0 NOT NULL,
	`trading_annual_bp` integer DEFAULT 0 NOT NULL,
	`cash_annual_bp` integer DEFAULT 0 NOT NULL,
	`inflation_annual_bp` integer DEFAULT 0 NOT NULL,
	`trading_projection_enabled` integer DEFAULT true NOT NULL,
	`trading_max_loss_bp` integer,
	`description` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projection_scenarios_key_unique` ON `projection_scenarios` (`key`);--> statement-breakpoint
CREATE TABLE `salary_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` integer NOT NULL,
	`effective_month` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`superseded_by_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `salary_changes_effective_idx` ON `salary_changes` (`effective_month`,`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist_stocks` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
