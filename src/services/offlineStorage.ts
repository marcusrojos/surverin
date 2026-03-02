import localforage from 'localforage';
import { Database } from '@/integrations/supabase/types';

type Delivery = Database['public']['Tables']['deliveries']['Row'];
type Pharmacy = Database['public']['Tables']['pharmacies']['Row'];

// Configure stores
const deliveriesStore = localforage.createInstance({ name: 'dpci', storeName: 'deliveries' });
const pharmaciesStore = localforage.createInstance({ name: 'dpci', storeName: 'pharmacies' });
const axisStore = localforage.createInstance({ name: 'dpci', storeName: 'axis_pharmacies' });
const metaStore = localforage.createInstance({ name: 'dpci', storeName: 'meta' });

export interface AxisPharmacy {
  pharmacy_id: string;
  position: number;
}

export const OfflineStorage = {
  // ── Deliveries ──
  async saveDeliveries(deliveries: Delivery[]): Promise<void> {
    await deliveriesStore.setItem('all', deliveries);
    await metaStore.setItem('deliveries_updated_at', Date.now());
  },

  async getDeliveries(): Promise<Delivery[]> {
    return (await deliveriesStore.getItem<Delivery[]>('all')) || [];
  },

  async updateDelivery(id: string, patch: Partial<Delivery>): Promise<void> {
    const all = await this.getDeliveries();
    const updated = all.map(d => (d.id === id ? { ...d, ...patch } : d));
    await this.saveDeliveries(updated);
  },

  // ── Pharmacies ──
  async savePharmacies(pharmacies: Pharmacy[]): Promise<void> {
    await pharmaciesStore.setItem('all', pharmacies);
  },

  async getPharmacies(): Promise<Pharmacy[]> {
    return (await pharmaciesStore.getItem<Pharmacy[]>('all')) || [];
  },

  // ── Axis pharmacies ──
  async saveAxisPharmacies(data: AxisPharmacy[]): Promise<void> {
    await axisStore.setItem('all', data);
  },

  async getAxisPharmacies(): Promise<AxisPharmacy[]> {
    return (await axisStore.getItem<AxisPharmacy[]>('all')) || [];
  },

  // ── Meta ──
  async getLastUpdated(): Promise<number | null> {
    return metaStore.getItem<number>('deliveries_updated_at');
  },
};
