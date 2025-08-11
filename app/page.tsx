'use client';

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
// import { Switch } from "@/components/ui/switch";
import { QRCodeCanvas } from "qrcode.react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Plus, Download, Upload, Save, Trash2, Edit, QrCode, Copy, ShieldCheck, Lock, Globe, Package, RefreshCw } from "lucide-react";
// import { Plus, Download, Upload, Save, Trash2, Edit, QrCode, Link, Copy, ShieldCheck, Lock, Globe, FileJson, Package, RefreshCw } from "lucide-react";

/**
 * Back-office React pour gérer les fiches médicales NFC.
 * - Gère un catalogue local (localStorage)
 * - Exporte des JSON prêts à déposer dans /data/<id>.json
 * - Génère les URL publiques: <baseUrl>/m/<id>
 * - Exporte un ZIP (data/<id>.json) pour déployer sur l'hébergement statique
 * - Import de JSON (un ou plusieurs) pour rééditer
 * - Génère QR Code + boutons copier URL / commande d'écriture NFC
 * - Interface FR, épurée, responsive.
 *
 * Prérequis côté public: conserver votre page viewer fournie précédemment à l'URL /m/index.html
 */

// -------- Types --------
export type MedicalCard = {
  id: string;
  token?: string; // optionnel si vous activez un paramètre d'accès (?t=)
  nom: string;
  adresse: string;
  telephone: string;
  groupe_sanguin: string;
  allergies: string[];
  traitements: string;
  medicaments: string[];
  urgence: { nom: string; telephone: string } | null;
  last_update: string; // ISO string
};

// -------- Utilitaires --------
const STORAGE_KEY = "nfc_med_cards_v1";
const BASEURL_KEY = "nfc_base_url";
// const PREFS_KEY = "nfc_admin_prefs";

const alpha = "0123456789abcdefghijklmnopqrstuvwxyz";
function nanoid(n = 10) {
  let s = "";
  const a = alpha.length;
  // compat SSR / build
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(new Uint32Array(n)).forEach((v) => (s += alpha[v % a]));
  } else {
    for (let i = 0; i < n; i++) s += alpha[Math.floor(Math.random() * a)];
  }
  return s;
}

function nowISO() {
  return new Date().toISOString();
}

function toDisplayDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString();
}

function sanitizeBaseUrl(s: string) {
  if (!s) return "";
  return s.replace(/\/$/, "");
}

function buildPublicUrl(baseUrl: string, id: string, token?: string) {
  const u = `${sanitizeBaseUrl(baseUrl) || "nfc-med.vercel.app"}/m/${encodeURIComponent(id)}`;
  return token ? `${u}?t=${encodeURIComponent(token)}` : u;
}

function cardToJson(card: MedicalCard) {
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
    ...(card.token ? { token: card.token } : {}),
  };
}

// helpers de parse sûrs
const asString = (v: unknown, def = ""): string => (typeof v === "string" ? v : def);
const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : (typeof v === "string" ? v.split(/\s*,\s*|\n+/).filter(Boolean) : []);

function fromJsonToCard(json: unknown, id?: string): MedicalCard {
  const obj = (json && typeof json === "object") ? (json as Record<string, unknown>) : {};
  const u = (obj["urgence"] && typeof obj["urgence"] === "object") ? (obj["urgence"] as Record<string, unknown>) : undefined;

  return {
    id: id || nanoid(),
    token: asString(obj["token"]),
    nom: asString(obj["nom"]),
    adresse: asString(obj["adresse"]),
    telephone: asString(obj["telephone"]),
    groupe_sanguin: asString(obj["groupe_sanguin"]),
    allergies: toStringArray(obj["allergies"]),
    traitements: asString(obj["traitements"]),
    medicaments: toStringArray(obj["medicaments"]),
    urgence: u ? { nom: asString(u["nom"]), telephone: asString(u["telephone"]) } : { nom: "", telephone: "" },
    last_update: asString(obj["last_update"], nowISO()),
  };
}

function downloadFile(filename: string, content: string, mime = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  saveAs(blob, filename);
}

// function ensureArray<T>(v: T | T[]): T[] { return Array.isArray(v) ? v : [v]; }

// -------- Composants --------

function Toolbar({
  onNew,
  onImport,
  onExportZip,
  baseUrl,
  setBaseUrl,
}: {
  onNew: () => void;
  onImport: (files: FileList | null) => void;
  onExportZip: () => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-2 w-full sm:max-w-lg">
        <Label htmlFor="baseUrl" className="text-xs uppercase tracking-wide text-muted-foreground">
          Base URL du site public
        </Label>
        <div className="flex gap-2">
          <Input id="baseUrl" placeholder="nfc-med.vercel.app" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Button variant="secondary" onClick={() => setBaseUrl("nfc-med.vercel.app")}>Reset</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {`C'est la racine où vit votre viewer (/m/index.html). L'URL publique sera `}
          <code className="font-mono">
            {sanitizeBaseUrl(baseUrl) || "nfc-med.vercel.app"}/m/&lt;id&gt;
          </code>
          {`.`}
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={onNew} className="gap-2"><Plus className="h-4 w-4" />Nouvelle fiche</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          multiple
          className="hidden"
          onChange={(e) => onImport(e.target.files)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" />Import/Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Importer</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />Importer JSON…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Exporter</DropdownMenuLabel>
            <DropdownMenuItem onClick={onExportZip} className="gap-2"><Package className="h-4 w-4" />Exporter tout en ZIP</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    <div className="rounded-2xl border bg-card">
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
              <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                {`Aucune fiche pour l'instant.`}
              </TableCell>
            </TableRow>
          )}
          {cards.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.id}</TableCell>
              <TableCell className="font-medium">{c.nom || <span className="text-muted-foreground">(sans nom)</span>}</TableCell>
              <TableCell>{c.groupe_sanguin || <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                {c.urgence?.nom ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{c.urgence.nom}</Badge>
                    <span className="text-xs text-muted-foreground">{c.urgence.telephone}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{toDisplayDate(c.last_update)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button size="icon" variant="ghost" title="Éditer" onClick={() => onEdit(c.id)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Télécharger JSON" onClick={() => onDownload(c.id)}><Download className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="QR / URL / NFC" onClick={() => onQr(c.id)}><QrCode className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Supprimer" onClick={() => onDelete(c.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
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
  onOpenChange,
  card,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: MedicalCard | null;
  onSave: (c: MedicalCard) => void;
}) {
  const [local, setLocal] = useState<MedicalCard | null>(card);
  useEffect(() => setLocal(card), [card]);

  function set<K extends keyof MedicalCard>(key: K, val: MedicalCard[K]) {
    if (!local) return;
    setLocal({ ...local, [key]: val });
  }

  if (!local) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Éditer la fiche</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identite" className="mt-2">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="identite">Identité</TabsTrigger>
            <TabsTrigger value="medical">Médical</TabsTrigger>
            <TabsTrigger value="urgence">Urgence</TabsTrigger>
          </TabsList>

          <TabsContent value="identite" className="mt-4">
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
              <div className="grid gap-2">
                <Label>ID (URL)</Label>
                <div className="flex gap-2">
                  <Input value={local.id} onChange={(e) => set("id", e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" onClick={() => set("id", nanoid())}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Token (optionnel)</Label>
                <div className="flex gap-2">
                  <Input value={local.token || ""} onChange={(e) => set("token", e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" onClick={() => set("token", nanoid(16))}><Lock className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" onClick={() => set("token", "")}>Effacer</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {`Si renseigné, l'URL inclura `}
                  <code className="font-mono">?t=…</code>
                  {` (à faire vérifier côté viewer si vous le souhaitez).`}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="medical" className="mt-4">
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

          <TabsContent value="urgence" className="mt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{`Nom du contact d'urgence`}</Label>
                <Input
                  value={local.urgence?.nom || ""}
                  onChange={(e) => set("urgence", { ...(local.urgence || { telephone: "" }), nom: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{`Téléphone du contact d'urgence`}</Label>
                <Input
                  value={local.urgence?.telephone || ""}
                  onChange={(e) => set("urgence", { ...(local.urgence || { nom: "" }), telephone: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => onSave({ ...local, last_update: nowISO() })} className="gap-2"><Save className="h-4 w-4" />Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  open,
  onOpenChange,
  card,
  baseUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: MedicalCard | null;
  baseUrl: string;
}) {
  if (!card) return null;
  const url = buildPublicUrl(baseUrl, card.id, card.token);
  const cmd = `python tools/write_ntag215.py ${url}`;

  function copy(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Partager / Encoder</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-center">
            <div className="p-4 rounded-xl border bg-background">
              <QRCodeCanvas value={url} size={192} includeMargin />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>URL publique</Label>
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono" />
              <Button variant="outline" onClick={() => copy(url)} className="gap-2"><Copy className="h-4 w-4" />Copier</Button>
              <Button asChild className="gap-2">
                <a href={url} target="_blank" rel="noreferrer"><Globe className="h-4 w-4" />Ouvrir</a>
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{`Commande d'écriture NFC (PC + lecteur)`}</Label>
            <div className="flex gap-2">
              <Input readOnly value={cmd} className="font-mono" />
              <Button variant="outline" onClick={() => copy(cmd)} className="gap-2"><Copy className="h-4 w-4" />Copier</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Nécessite votre script <code className="font-mono">tools/write_ntag215.py</code> et un lecteur compatible (ex. ACR122U).
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {`Astuce: imprimez le QR et glissez-le dans le portefeuille de la personne, en plus de la puce.`}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="destructive" onClick={onConfirm} className="gap-2"><Trash2 className="h-4 w-4" />Supprimer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MedicalNFCAdmin() {
  const [cards, setCards] = useState<MedicalCard[]>([]);
  const [baseUrl, setBaseUrl] = useState<string>("nfc-med.vercel.app");
  const [editId, setEditId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const editing = useMemo(() => cards.find((c) => c.id === editId) || null, [cards, editId]);
  const qrcard = useMemo(() => cards.find((c) => c.id === qrId) || null, [cards, qrId]);

  // Charger
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setCards(arr);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Charger baseUrl
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(BASEURL_KEY);
      if (stored) setBaseUrl(stored);
    }
  }, []);

  // Sauver
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    }
  }, [cards]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BASEURL_KEY, baseUrl);
    }
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
      last_update: nowISO(),
    };
    setCards((prev) => [c, ...prev]);
    setEditId(c.id);
  }

  function saveCard(updated: MedicalCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditId(null);
  }

  function deleteCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setDeleteId(null);
  }

  function downloadJson(id: string) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const json = cardToJson(card);
    downloadFile(`${id}.json`, JSON.stringify(json, null, 2));
  }

  async function exportZip() {
    const zip = new JSZip();
    const folder = zip.folder("data");
    if (!folder) return;
    cards.forEach((c) => folder.file(`${c.id}.json`, JSON.stringify(cardToJson(c), null, 2)));
    const readme =
      `Déposez le contenu du dossier data/ à la racine de votre hébergement statique (\n` +
      `ex: /data/<id>.json) et conservez votre viewer à /m/index.html.\n` +
      `BaseURL actuelle: ${sanitizeBaseUrl(baseUrl)}`;
    zip.file("README.txt", readme);
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `nfc-medical-data-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  async function onImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imported: MedicalCard[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const json = JSON.parse(text);
        // Essaye d'inférer l'ID depuis le nom de fichier si possible
        const inferredId = f.name.replace(/\.json$/i, "");
        const card = fromJsonToCard(json, inferredId);
        imported.push(card);
      } catch (e) {
        console.error("Import error for", f.name, e);
      }
    }
    if (imported.length) {
      // fusion (remplace si même id)
      setCards((prev) => {
        const map = new Map(prev.map((c) => [c.id, c] as const));
        for (const c of imported) map.set(c.id, c);
        return Array.from(map.values());
      });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-5 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Back-office — Fiches médicales NFC</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Générez, éditez et exportez des fiches prêtes pour vos puces NTAG215 et votre site public.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <Toolbar
              onNew={createNew}
              onImport={onImport}
              onExportZip={exportZip}
              baseUrl={baseUrl}
              setBaseUrl={setBaseUrl}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Fiches <Badge variant="secondary">{cards.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardsTable
              cards={cards}
              onEdit={(id) => setEditId(id)}
              onDelete={(id) => setDeleteId(id)}
              onDownload={downloadJson}
              onQr={(id) => setQrId(id)}
            />
          </CardContent>
        </Card>

        {/* Dialogs */}
        <EditDialog open={!!editId} onOpenChange={(v) => !v && setEditId(null)} card={editing} onSave={saveCard} />
        <QrDialog open={!!qrId} onOpenChange={(v) => !v && setQrId(null)} card={qrcard} baseUrl={baseUrl} />
        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={(v) => !v && setDeleteId(null)}
          onConfirm={() => deleteCard(deleteId!)}
          title="Supprimer la fiche ?"
          description="Cette action est définitive (dans ce back-office)."
        />

        <footer className="text-xs text-muted-foreground text-center mt-8">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Conseil confidentialité : protégez ce back-office par mot de passe (Basic Auth / proxy) et utilisez des IDs opaques.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
