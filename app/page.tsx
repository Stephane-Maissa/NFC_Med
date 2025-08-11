"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
// UI minimal (sans shadcn) — assure-toi d'avoir créé les fichiers dans components/ui/*
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { QRCodeCanvas } from "qrcode.react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Plus, Download, Save, Trash2, Edit, QrCode, RefreshCw, Copy, Globe } from "lucide-react";

/**
 * app/page.tsx — Back-office React pour gérer les fiches médicales NFC
 * — Compatible Next.js App Router + Vercel
 * — Utilise un kit UI minimal (pas besoin de shadcn)
 */

type MedicalCard = {
  id: string;
  token?: string;
  nom: string;
  adresse: string;
  telephone: string;
  groupe_sanguin: string;
  allergies: string[];
  traitements: string;
  medicaments: string[];
  urgence: { nom: string; telephone: string } | null;
  url?: string;
  last_update: string;
};

// Type sûr pour l'import JSON (évite `any`)
type MedicalCardJSON = Partial<{
  token: string;
  nom: string;
  adresse: string;
  telephone: string;
  groupe_sanguin: string;
  allergies: string[] | string;
  traitements: string;
  medicaments: string[] | string;
  urgence: { nom?: string; telephone?: string };
  last_update: string;
  url: string;
}>;

const STORAGE_KEY = "nfc_med_cards_v1";
const BASEURL_KEY = "nfc_base_url";

const alpha = "0123456789abcdefghijklmnopqrstuvwxyz";
function nanoid(n = 10) {
  let s = "";
  const a = alpha.length;
  crypto.getRandomValues(new Uint32Array(n)).forEach((v) => (s += alpha[v % a]));
  return s;
}
const nowISO = () => new Date().toISOString();
const toDisplayDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "—");

// Amélioré : trim, supprime le slash final, ajoute https:// si manquant
const sanitizeBaseUrl = (s: string) => {
  if (!s) return "";
  s = s.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s;
};

const buildPublicUrl = (baseUrl: string, id: string, token?: string) => {
  const u = `${sanitizeBaseUrl(baseUrl) || "https://ton-domaine"}/m/${encodeURIComponent(id)}`;
  return token ? `${u}?t=${encodeURIComponent(token)}` : u;
};

function cardToJson(card: MedicalCard, baseUrl: string) {
  return {
    nom: card.nom || "",
    adresse: card.adresse || "",
    telephone: card.telephone || "",
    groupe_sanguin: card.groupe_sanguin || "",
    allergies: card.allergies || [],
    traitements: card.traitements || "",
    medicaments: card.medicaments || [],
    urgence: card.urgence ? { nom: card.urgence.nom || "", telephone: card.urgence.telephone || "" } : { nom: "", telephone: "" },
    last_update: card.last_update || nowISO(),
    url: buildPublicUrl(baseUrl, card.id, card.token),
    ...(card.token ? { token: card.token } : {}),
  };
}

function fromJsonToCard(json: MedicalCardJSON, id?: string): MedicalCard {
  return {
    id: id || nanoid(),
    token: json?.token || "",
    nom: json?.nom || "",
    adresse: json?.adresse || "",
    telephone: json?.telephone || "",
    groupe_sanguin: json?.groupe_sanguin || "",
    allergies: Array.isArray(json?.allergies)
      ? json.allergies
      : json?.allergies
      ? String(json.allergies).split(/\s*,\s*|\n+/).filter(Boolean)
      : [],
    traitements: json?.traitements || "",
    medicaments: Array.isArray(json?.medicaments)
      ? json.medicaments
      : json?.medicaments
      ? String(json.medicaments).split(/\s*,\s*|\n+/).filter(Boolean)
      : [],
    urgence: json?.urgence ? { nom: json.urgence.nom || "", telephone: json.urgence.telephone || "" } : { nom: "", telephone: "" },
    url: json?.url || "",
    last_update: json?.last_update || nowISO(),
  };
}

function downloadFile(filename: string, content: string, mime = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  saveAs(blob, filename);
}

function Toolbar({
  onNew,
  onImportFiles,
  onExportZip,
  baseUrl,
  setBaseUrl,
}: {
  onNew: () => void;
  onImportFiles: (files: FileList | null) => void;
  onExportZip: () => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-2 w-full sm:max-w-lg">
        <Label htmlFor="baseUrl" className="text-xs">
          Base URL du site public
        </Label>
        <div className="flex gap-2">
          <Input id="baseUrl" placeholder="https://ton-domaine" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Button variant="secondary" onClick={() => setBaseUrl("https://ton-domaine")}>
            Reset
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Le viewer vit à <code className="font-mono">/m/index.html</code> et lit <code className="font-mono">/data/&lt;id&gt;.json</code>.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={onNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle fiche
        </Button>
        <input ref={fileRef} type="file" accept="application/json" multiple className="hidden" onChange={(e) => onImportFiles(e.target.files)} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          Importer JSON…
        </Button>
        <Button variant="outline" onClick={onExportZip}>
          Exporter ZIP
        </Button>
      </div>
    </div>
  );
}

function CardsTable({
  cards,
  onEdit,
  onDelete,
  onDownload,
  onQr,
}: {
  cards: MedicalCard[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  onQr: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">ID</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead>Groupe</TableHead>
            <TableHead>Urgence</TableHead>
            <TableHead>Maj</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-500 py-10">
                Aucune fiche.
              </TableCell>
            </TableRow>
          )}
          {cards.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.id}</TableCell>
              <TableCell className="font-medium">{c.nom || <span className="text-gray-500">(sans nom)</span>}</TableCell>
              <TableCell>{c.groupe_sanguin || <span className="text-gray-500">—</span>}</TableCell>
              <TableCell>
                {c.urgence?.nom ? (
                  <span className="inline-flex items-center gap-2">
                    <Badge>{c.urgence.nom}</Badge>
                    <span className="text-xs text-gray-500">{c.urgence.telephone}</span>
                  </span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-500">{toDisplayDate(c.last_update)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button size="icon" variant="outline" title="Éditer" onClick={() => onEdit(c.id)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" title="Télécharger JSON" onClick={() => onDownload(c.id)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" title="QR / URL / NFC" onClick={() => onQr(c.id)}>
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="destructive" title="Supprimer" onClick={() => onDelete(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditDialog({
  open,
  setOpen,
  card,
  onSave,
  baseUrl,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  card: MedicalCard | null;
  onSave: (c: MedicalCard) => void;
  baseUrl: string;
}) {
  const [local, setLocal] = useState<MedicalCard | null>(card);
  useEffect(() => setLocal(card), [card]);
  function set<K extends keyof MedicalCard>(key: K, val: MedicalCard[K]) {
    if (!local) return;
    setLocal({ ...local, [key]: val });
  }
  if (!local) return null;
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Éditer la fiche</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identite" className="mt-2">
          <TabsList className="grid grid-cols-3 mb-2">
            <TabsTrigger value="identite">Identité</TabsTrigger>
            <TabsTrigger value="medical">Médical</TabsTrigger>
            <TabsTrigger value="urgence">Urgence</TabsTrigger>
          </TabsList>

          <TabsContent value="identite">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Nom et prénom</Label>
                <Input value={local.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Dupont Alice" />
              </div>
              <div className="grid gap-2">
                <Label>Téléphone</Label>
                <Input value={local.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="+1 514…" />
              </div>
              <div className="sm:col-span-2 grid gap-2">
                <Label>Adresse</Label>
                <Textarea value={local.adresse} onChange={(e) => set("adresse", e.target.value)} placeholder="1234 Rue…" rows={2} />
              </div>

              {/* URL complète (calculée automatiquement) */}
              <div className="grid gap-2">
                <Label>URL complète</Label>
                <div className="flex gap-2">
                  <Input readOnly value={buildPublicUrl(baseUrl, local.id, local.token)} className="font-mono" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigator.clipboard?.writeText(buildPublicUrl(baseUrl, local.id, local.token))}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copier
                  </Button>
                  <Button type="button" variant="outline" onClick={() => set("id", nanoid())} title="Générer un nouvel ID">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-xs text-gray-500">
                  ID interne : <span className="font-mono">{local.id}</span> — Base URL :{" "}
                  <span className="font-mono">{sanitizeBaseUrl(baseUrl) || "https://ton-domaine"}</span>
                </div>
              </div>

              {/* ID interne éditable */}
              <div className="grid gap-2">
                <Label>ID interne (modifiable)</Label>
                <Input value={local.id} onChange={(e) => set("id", e.target.value.replace(/\s+/g, ""))} className="font-mono" />
              </div>

              <div className="grid gap-2">
                <Label>Token (optionnel)</Label>
                <div className="flex gap-2">
                  <Input value={local.token || ""} onChange={(e) => set("token", e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" onClick={() => set("token", nanoid(16))}>
                    Générer
                  </Button>
                  <Button type="button" variant="outline" onClick={() => set("token", "")}>
                    Effacer
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="medical">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Groupe sanguin</Label>
                <Input value={local.groupe_sanguin} onChange={(e) => set("groupe_sanguin", e.target.value)} placeholder="O+" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Allergies (une par ligne)</Label>
                <Textarea value={local.allergies?.join("\n") || ""} onChange={(e) => set("allergies", e.target.value.split(/\n+/).filter(Boolean))} rows={3} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Traitements</Label>
                <Textarea value={local.traitements} onChange={(e) => set("traitements", e.target.value)} rows={3} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Médicaments (un par ligne)</Label>
                <Textarea value={local.medicaments?.join("\n") || ""} onChange={(e) => set("medicaments", e.target.value.split(/\n+/).filter(Boolean))} rows={3} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="urgence">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Nom du contact d&apos;urgence</Label>
                <Input value={local.urgence?.nom || ""} onChange={(e) => set("urgence", { ...(local.urgence || { telephone: "" }), nom: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Téléphone du contact d&apos;urgence</Label>
                <Input value={local.urgence?.telephone || ""} onChange={(e) => set("urgence", { ...(local.urgence || { nom: "" }), telephone: e.target.value })} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={() => onSave({ ...local, last_update: nowISO() })} className="gap-2">
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  open,
  setOpen,
  card,
  baseUrl,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  card: MedicalCard | null;
  baseUrl: string;
}) {
  if (!card) return null;
  const url = buildPublicUrl(baseUrl, card.id, card.token);
  const cmd = `python tools/write_ntag215.py ${url}`;
  const copy = (t: string) => navigator.clipboard?.writeText(t);
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Partager / Encoder</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-center">
            <div className="p-4 rounded-xl border bg-white">
              <QRCodeCanvas value={url} size={192} includeMargin />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>URL publique</Label>
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono" />
              <Button variant="outline" onClick={() => copy(url)} className="gap-2">
                <Copy className="h-4 w-4" />
                Copier
              </Button>
              <Button asChild className="gap-2">
                <a href={url} target="_blank" rel="noreferrer">
                  <Globe className="h-4 w-4" />
                  Ouvrir
                </a>
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commande d&apos;écriture NFC</Label>
            <div className="flex gap-2">
              <Input readOnly value={cmd} className="font-mono" />
              <Button variant="outline" onClick={() => copy(cmd)} className="gap-2">
                <Copy className="h-4 w-4" />
                Copier
              </Button>
            </div>
          </div>
          <div className="text-xs text-gray-500">Astuce: imprimez le QR pour le portefeuille de la personne.</div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  setOpen,
  onConfirm,
  title,
  description,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}) {
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Page() {
  const [cards, setCards] = useState<MedicalCard[]>([]);
  const [baseUrl, setBaseUrl] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem(BASEURL_KEY) || window.location.origin : "https://ton-domaine"
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const editing = useMemo(() => cards.find((c) => c.id === editId) || null, [cards, editId]);
  const qrcard = useMemo(() => cards.find((c) => c.id === qrId) || null, [cards, qrId]);

  // Charger depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setCards(arr);
      }
    } catch {}
  }, []);

  // Sauvegarder dans localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }, [cards]);

  // Mémoriser la base URL et recalculer l'URL publique des fiches si elle change
  useEffect(() => {
    localStorage.setItem(BASEURL_KEY, baseUrl);
    setCards((prev) => prev.map((c) => ({ ...c, url: buildPublicUrl(baseUrl, c.id, c.token) })));
  }, [baseUrl]);

  function createNew() {
    const c: MedicalCard = {
      id: nanoid(),
      token: "",
      nom: "",
      adresse: "",
      telephone: "",
      groupe_sanguin: "",
      allergies: [],
      traitements: "",
      medicaments: [],
      urgence: { nom: "", telephone: "" },
      url: "",
      last_update: nowISO(),
    };
    c.url = buildPublicUrl(baseUrl, c.id, c.token);
    setCards((prev) => [c, ...prev]);
    setEditId(c.id);
  }

  // Remplace la fiche par son ancien ID (editId), même si l'utilisateur a modifié l'ID
  function saveCard(updated: MedicalCard) {
    const safeId = (updated.id || "").trim() || nanoid();
    const baseCard = { ...updated, id: safeId, last_update: nowISO() };
    setCards((prev) => {
      const hasConflict = prev.some((c) => c.id === baseCard.id && c.id !== editId);
      let finalId = baseCard.id;
      if (hasConflict) {
        const suffix = "-" + nanoid(4);
        finalId = baseCard.id + suffix;
      }
      const finalCard = { ...baseCard, id: finalId, url: buildPublicUrl(baseUrl, finalId, baseCard.token) };
      return prev.map((c) => (c.id === (editId ?? baseCard.id) ? finalCard : c));
    });
    setEditId(null);
  }

  function deleteCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setDeleteId(null);
  }

  function downloadJson(id: string) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const json = cardToJson(card, baseUrl);
    downloadFile(`${id}.json`, JSON.stringify(json, null, 2));
  }

  async function exportZip() {
    const zip = new JSZip();
    const folder = zip.folder("data");
    if (!folder) return;
    cards.forEach((c) => folder.file(`${c.id}.json`, JSON.stringify(cardToJson(c, baseUrl), null, 2)));
    const readme = `Déposez le dossier data/ à la racine (public/data).
BaseURL: ${sanitizeBaseUrl(baseUrl)}
Chaque JSON contient un champ "url" pointant vers /m/<id>.`;
    zip.file("README.txt", readme);
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `nfc-medical-data-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  async function onImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imported: MedicalCard[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const json = JSON.parse(text) as MedicalCardJSON;
        const inferredId = f.name.replace(/\.json$/i, "");
        imported.push(fromJsonToCard(json, inferredId));
      } catch (e) {
        console.error("Import error", f.name, e);
      }
    }
    if (imported.length) {
      setCards((prev) => {
        const map = new Map(prev.map((c) => [c.id, c] as const));
        for (const c of imported) {
          const merged = { ...c, url: buildPublicUrl(baseUrl, c.id, c.token) };
          map.set(c.id, merged);
        }
        return Array.from(map.values());
      });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl p-5 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Back-office — Fiches médicales NFC</h1>
          <p className="text-sm text-gray-600 mt-1">Générez, éditez et exportez des fiches prêtes pour vos puces NTAG215 et votre site public.</p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <Toolbar onNew={createNew} onImportFiles={onImportFiles} onExportZip={exportZip} baseUrl={baseUrl} setBaseUrl={setBaseUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Fiches <Badge>{cards.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardsTable cards={cards} onEdit={(id) => setEditId(id)} onDelete={(id) => setDeleteId(id)} onDownload={downloadJson} onQr={(id) => setQrId(id)} />
          </CardContent>
        </Card>

        {/* Dialogs */}
        <EditDialog open={!!editId} setOpen={(v) => !v && setEditId(null)} card={editing} onSave={saveCard} baseUrl={baseUrl} />
        <QrDialog open={!!qrId} setOpen={(v) => !v && setQrId(null)} card={qrcard} baseUrl={baseUrl} />
        <ConfirmDialog
          open={!!deleteId}
          setOpen={(v) => !v && setDeleteId(null)}
          onConfirm={() => deleteCard(deleteId!)}
          title="Supprimer la fiche ?"
          description="Cette action est définitive (dans ce back-office)."
        />

        <footer className="text-xs text-gray-500 text-center mt-8">
          <span>Conseil : protégez ce back-office par mot de passe et utilisez des IDs opaques.</span>
        </footer>
      </div>
    </div>
  );
}
