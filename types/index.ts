/** When product has units_per_pack: total in base units, full boxes, loose units. */
export interface StockDisplayPack {
    total_units: number;
    full_boxes: number;
    loose_units: number;
  }
  
  export interface Product {
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    documentary_name?: string | null;
    category: string | null;
    category_code: string | null;
    brand: string | null;
    dosage: string | null;
    form: string | null;
    selling_price: string;
    cost_price: string | null;
    /** Pack/unit selling (box or individual units from box). */
    can_sell_by_box?: boolean;
    can_sell_by_unit?: boolean;
    pack_name?: string | null;
    unit_name?: string | null;
    units_per_pack?: number | null;
    box_selling_price?: string | null;
    unit_selling_price?: string | null;
    stock_quantity: number;
    minimum_stock: number;
    initial_back_count?: number | null;
    initial_front_count?: number | null;
    initial_total_count?: number | null;
    initial_count_confirmed: boolean;
    batch_number: string | null;
    expiry_date: string | null;
    location: string | null;
    is_verified: boolean;
    source_type: string | null;
    boxes?: number | null;
    blisters?: number | null;
    units_per_blister?: number | null;
    loose_units?: number | null;
    other_pack_count?: number | null;
    other_pack_type?: string | null;
    notes?: string | null;
    needs_audit_review?: boolean;
    created_at: string;
    updated_at: string;
    /** For pack products: total_units, full_boxes, loose_units. */
    stock_display_pack?: StockDisplayPack | null;
    /** True if expiry_date is in the past (for clear flagging in UI). */
    is_expired: boolean;
    /** True if product expires within the alert threshold (e.g. 30 days). */
    is_expiring_soon: boolean;
  }
  
  export type StockMovementType = 'purchase' | 'sale' | 'adjustment' | 'damaged' | 'expired' | 'return';
  
  export interface StockMovement {
    id: number;
    product_id: number;
    movement_type: StockMovementType;
    quantity: number;
    previous_stock: number;
    new_stock: number;
    reason: string | null;
    batch_number: string | null;
    expiry_date: string | null;
    performed_by: number | null;
    created_at: string;
  }
  
  export interface SaleItem {
    id: number;
    sale_id: number;
    product_id: number;
    quantity: number;
    unit_price: string;
    total: string;
    sale_unit_type?: 'box' | 'unit' | null;
  }
  
  export interface Sale {
    id: number;
    user_id: number | null;
    total_amount: string;
    created_at: string;
    items: SaleItem[];
  }
  
  export interface SaleHistoryRecord {
    id: number;
    sale_id: number;
    product_id: number;
    sku: string;
    barcode: string | null;
    product_name: string;
    quantity: number;
    unit_price: string;
    total_price: string;
    sold_by: number | null;
    sold_at: string;
  }
  
  export interface SaleHistoryResponse {
    items: SaleHistoryRecord[];
    total_count: number;
  }
  
  export interface SaleSummaryResponse {
    daily_total: string;
    monthly_total: string;
    filtered_total: string | null;
  }
  
  export interface ExpiryCounts {
    expired: number;
    expiring_30: number;
    expiring_60: number;
    expiring_90: number;
  }
  
  export interface ExpiryAlertsResponse {
    expired: Product[];
    expiring_30: Product[];
    expiring_60: Product[];
    expiring_90: Product[];
    counts: ExpiryCounts;
  }
  
  export interface DashboardStats {
    total_products: number;
    total_stock_units: number;
    low_stock_count: number;
    expired_count: number;
    expiring_soon_count: number;
    sales_today: string;
    sales_this_month: string;
    low_stock_products: Product[];
    expiring_products: Product[];
    top_sold_products: Product[];
    recent_sales: Sale[];
  }
  