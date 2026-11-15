// « + Nouveau client » in the editor's client search (PRO-184): the few fields
// an invoice needs (name, DGI type, IFU, city, contact). The rest of the
// record is completed from Contacts.

import { useState, type FormEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { createClient } from '@/lib/api/clients';
import { CLIENT_TYPES, clientTypeDef, type ClientType } from '@/lib/client-type';
import type { ClientRecord } from '@/lib/schemas';

const AVS = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];

export default function ClientQuickCreate({ initialName, onCreated, onCancel }: {
  initialName: string;
  onCreated: (c: ClientRecord) => void;
  onCancel: () => void;
}) {
  const { orgId, clients, setClients, showToast } = useApp();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<ClientType>('PM');
  const [ifu, setIfu] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const ifuRequired = clientTypeDef(type).ifuRequired;

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Not the outer form, if any
    e.stopPropagation();
    if (busy || !name.trim()) return;
    if (!orgId) { showToast('Impossible de sauvegarder : organisation introuvable.', true); return; }
    setBusy(true);
    try {
      const created = await createClient(orgId, {
        av: AVS[clients.length % AVS.length], name: name.trim(), contact: '—',
        email: email.trim() || '—', phone: phone.trim() || '—', city: city.trim() || '—', country: 'Burkina Faso',
        ifu: ifu.trim(), rccm: '', taxRegime: '', fiscalDivision: '', clientType: type, status: 'active',
      });
      setClients(prev => prev.some(c => c.code === created.code) ? prev : [created, ...prev]);
      showToast(`« ${created.name} » ajouté aux clients`);
      onCreated(created);
    } catch (err) {
      console.error('[createClient]', err);
      showToast('Le client n’a pas pu être créé. Réessayez.', true);
      setBusy(false);
    }
  }

  return (
    <form className="ie-newclient" onSubmit={e => void submit(e)} aria-label="Nouveau client">
      <div className="ie-checks-title">Nouveau client</div>
      <label className="ie-nc-row">
        <span>Nom ou raison sociale</span>
        <input autoFocus className="form-input" required maxLength={255} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="ie-nc-row">
        <span>Type</span>
        <select className="form-input" value={type} onChange={e => setType(e.target.value as ClientType)}>
          {CLIENT_TYPES.filter(t => t.code !== 'CC').map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </label>
      <label className="ie-nc-row">
        <span>IFU {ifuRequired ? <small>(obligatoire pour émettre)</small> : <small>(facultatif)</small>}</span>
        <input className="form-input" maxLength={20} value={ifu} onChange={e => setIfu(e.target.value)} placeholder="ex. 00012345A" />
      </label>
      <div className="ie-nc-pair">
        <label className="ie-nc-row"><span>Ville</span><input className="form-input" maxLength={100} value={city} onChange={e => setCity(e.target.value)} /></label>
        <label className="ie-nc-row"><span>Téléphone</span><input className="form-input" type="tel" maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} /></label>
      </div>
      <label className="ie-nc-row"><span>E-mail</span><input className="form-input" type="email" maxLength={255} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <div className="ie-nc-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Retour</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Création…' : 'Créer et choisir'}</button>
      </div>
    </form>
  );
}
