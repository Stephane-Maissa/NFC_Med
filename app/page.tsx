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
  const u = `${sanitizeBaseUrl(baseUrl) || "https://github.com/Stephane-Maissa"}/m/${encodeURIComponent(id)}`;
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
          <Input id="baseUrl" placeholder="https://github.com/Stephane-Maissa" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Button variant="secondary" onClick={() => setBaseUrl("https://github.com/Stephane-Maissa")}>Reset</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {`C'est la racine où vit votre viewer (/m/index.html). L'URL publique sera `}
          <code className="font-mono">
            {sanitizeBaseUrl(baseUrl) || "https://github.com/Stephane-Maissa"}/m/&lt;id&gt;
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
