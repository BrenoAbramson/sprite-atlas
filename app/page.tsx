"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { SpriteCanvas } from "../components/SpriteCanvas";
import { Catalog, Category, StoredLibrary, Thing, deleteLibrary, listLibraries, parseCatalog, saveLibrary } from "../lib/tibia";

type Loaded = { library: StoredLibrary; catalog: Catalog; spr: ArrayBuffer };
const tabs = ["Resumo", "Items", "Outfits", "Effects", "Missiles", "Todas as sprites"] as const;
const categoryByTab: Partial<Record<(typeof tabs)[number], Category>> = { Items: "items", Outfits: "outfits", Effects: "effects", Missiles: "missiles" };
const PAGE_SIZE = 120;

export default function Home() {
  const [libraries, setLibraries] = useState<StoredLibrary[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Resumo");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(2);
  const [modal, setModal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [version, setVersion] = useState(780);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { listLibraries().then(setLibraries).catch(() => setError("Não foi possível abrir o armazenamento local.")); }, []);

  async function loadLibrary(library: StoredLibrary) {
    setBusy(true); setError("");
    try {
      const [dat, spr] = await Promise.all([library.dat.arrayBuffer(), library.spr.arrayBuffer()]);
      setLoaded({ library, catalog: parseCatalog(dat, spr, library.version), spr });
      setTab("Resumo"); setPage(1); setQuery("");
      localStorage.setItem("sprite-atlas-active", library.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao processar os arquivos."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!libraries.length || loaded) return;
    const wanted = localStorage.getItem("sprite-atlas-active");
    const library = libraries.find((item) => item.id === wanted) || libraries[0];
    if (library) loadLibrary(library);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraries]);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    setFiles(selected); setError("");
    const dat = selected.find((file) => file.name.toLowerCase().endsWith(".dat"));
    if (dat && !name) setName(dat.name.replace(/\.dat$/i, ""));
    setModal(true); event.target.value = "";
  }

  async function importLibrary() {
    const dat = files.find((file) => file.name.toLowerCase().endsWith(".dat"));
    const spr = files.find((file) => file.name.toLowerCase().endsWith(".spr"));
    if (!dat || !spr) { setError("Selecione um arquivo .dat e um arquivo .spr juntos."); return; }
    if (!name.trim()) { setError("Informe um nome para a biblioteca."); return; }
    setBusy(true); setError("");
    try {
      const [datBuffer, sprBuffer] = await Promise.all([dat.arrayBuffer(), spr.arrayBuffer()]);
      parseCatalog(datBuffer, sprBuffer, version);
      const library: StoredLibrary = { id: crypto.randomUUID(), name: name.trim(), version, createdAt: Date.now(), dat, spr };
      await navigator.storage?.persist?.();
      await saveLibrary(library);
      const next = await listLibraries(); setLibraries(next); setModal(false); setFiles([]); setName("");
      await loadLibrary(library);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Arquivos incompatíveis ou corrompidos."); }
    finally { setBusy(false); }
  }

  async function removeCurrent() {
    if (!loaded || !confirm(`Remover a biblioteca “${loaded.library.name}” deste navegador?`)) return;
    await deleteLibrary(loaded.library.id); setLoaded(null); localStorage.removeItem("sprite-atlas-active");
    setLibraries(await listLibraries());
  }

  const entries = useMemo<Array<number | Thing>>(() => {
    if (!loaded || tab === "Resumo") return [];
    const category = categoryByTab[tab];
    const source: Array<number | Thing> = category ? loaded.catalog.things[category] : Array.from({ length: loaded.catalog.spriteCount }, (_, index) => index + 1);
    const id = Number(query);
    return query.trim() && Number.isFinite(id) ? source.filter((entry) => (typeof entry === "number" ? entry : entry.id) === id) : source;
  }, [loaded, tab, query]);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const visible = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [tab, query]);

  function changePage(nextPage: number) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const counts = loaded?.catalog.counts;
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">S</div><div><h1>Sprite Atlas</h1><p>Catálogo DAT + SPR</p></div></div>
      <div className="library-actions">
        <label className="library-select"><span>Biblioteca</span><select aria-label="Biblioteca ativa" value={loaded?.library.id || ""} onChange={(event) => { const item = libraries.find((library) => library.id === event.target.value); if (item) loadLibrary(item); }}><option value="">Nenhuma biblioteca</option>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label>
        {loaded && <button className="ghost-button" onClick={removeCurrent} title="Remover biblioteca">Remover</button>}
        <button className="import-button" onClick={() => fileInput.current?.click()}>Importar DAT + SPR</button>
        <input ref={fileInput} className="sr-only" type="file" multiple accept=".dat,.spr" onChange={chooseFiles} />
      </div>
    </header>
    <nav className="tabs" aria-label="Categorias do catálogo">{tabs.map((item) => <button key={item} disabled={!loaded} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>

    <section className="content">
      {error && <div className="error-banner"><strong>Atenção:</strong> {error}<button onClick={() => setError("")}>×</button></div>}
      {!loaded ? <Welcome onImport={() => fileInput.current?.click()} /> : tab === "Resumo" ? <Summary loaded={loaded} onBrowse={() => setTab("Todas as sprites")} /> : <>
        <div className="catalog-toolbar">
          <div><span className="eyebrow dark">{tab.toUpperCase()}</span><h2>{entries.length.toLocaleString("pt-BR")} registros</h2></div>
          <label className="search"><span>Buscar por ID</span><input inputMode="numeric" value={query} onChange={(event) => setQuery(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 23640" /></label>
          <label className="zoom"><span>Zoom</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option></select></label>
        </div>
        <p className="animation-hint">Sprites com mais de um frame animam ao passar o mouse ou selecionar o cartão.</p>
        <div className="catalog-grid">{visible.map((entry) => <SpriteCard key={`${tab}-${typeof entry === "number" ? entry : entry.id}`} entry={entry} loaded={loaded} scale={scale} />)}</div>
        {!visible.length && <div className="empty-state"><h3>ID não encontrado</h3><p>Confira o número ou limpe o campo de busca.</p></div>}
        <Pagination page={page} pages={pageCount} onChange={changePage} />
      </>}
    </section>

    {busy && <div className="busy"><div className="spinner"/><strong>Processando biblioteca…</strong><span>Arquivos grandes podem levar alguns segundos.</span></div>}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(false)}>×</button><span className="eyebrow dark">NOVA BIBLIOTECA</span><h2 id="import-title">Importar DAT + SPR</h2><p>Os arquivos serão salvos somente neste navegador.</p><div className="file-pair">{files.map((file) => <div key={file.name}><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div><label><span>Nome da biblioteca</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Naruto Old War 7.81" /></label><label><span>Formato do DAT</span><select value={version} onChange={(event) => setVersion(Number(event.target.value))}><option value={780}>Tibia 7.80 / 7.81</option><option value={760}>Tibia 7.60</option></select></label><button className="modal-submit" onClick={importLibrary}>Criar biblioteca</button></section></div>}
  </main>;
}

function SpriteCard({ entry, loaded, scale }: { entry: number | Thing; loaded: Loaded; scale: number }) {
  const [active, setActive] = useState(false);
  const id = typeof entry === "number" ? entry : entry.id;
  const animated = typeof entry !== "number" && entry.phases > 1;
  return <article className={`sprite-card${animated ? " is-animated" : ""}`} tabIndex={0} onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)} onClick={() => navigator.clipboard?.writeText(String(id))} title={animated ? "Passe o mouse para animar · clique para copiar o ID" : "Clique para copiar o ID"}>
    <div className="sprite-stage"><SpriteCanvas spr={loaded.spr} offsets={loaded.catalog.offsets} spriteId={typeof entry === "number" ? entry : undefined} thing={typeof entry === "number" ? undefined : entry} scale={scale} animate={active} />{animated && <span className="animated-badge" aria-label={`${entry.phases} frames`}>{entry.phases}f</span>}</div>
    <footer><span>ID</span><strong>{id}</strong>{typeof entry !== "number" && <small>{entry.sprites.length} spr.</small>}</footer>
  </article>;
}

function Welcome({ onImport }: { onImport: () => void }) { return <><div className="hero-card"><div><span className="eyebrow">CATÁLOGO OFFLINE</span><h2>Encontre qualquer sprite<br />sem percorrer uma coluna infinita.</h2><p>Importe um par Tibia.dat e Tibia.spr. Os arquivos são processados no seu navegador e nunca saem do seu computador.</p></div><button className="hero-import" onClick={onImport}><span>+</span><strong>Importar primeira biblioteca</strong><small>Selecione o DAT e o SPR juntos</small></button></div><div className="stats-row">{["Items","Outfits","Effects","Missiles","Sprites"].map((label) => <article key={label}><span>{label}</span><strong>—</strong></article>)}</div><div className="empty-state"><div className="pixel-stack"><i/><i/><i/></div><h3>Sua biblioteca começa aqui</h3><p>Compatível inicialmente com os formatos Tibia 7.60 e 7.80/7.81.</p></div></> }

function Summary({ loaded, onBrowse }: { loaded: Loaded; onBrowse: () => void }) { const { catalog, library } = loaded; const stats = [["Items",catalog.counts.items],["Outfits",catalog.counts.outfits],["Effects",catalog.counts.effects],["Missiles",catalog.counts.missiles],["Sprites",catalog.spriteCount]]; return <><div className="summary-head"><div><span className="eyebrow dark">BIBLIOTECA ATIVA</span><h2>{library.name}</h2><p>Formato {library.version === 760 ? "7.60" : "7.80 / 7.81"} · importado em {new Date(library.createdAt).toLocaleDateString("pt-BR")}</p></div><button className="import-button" onClick={onBrowse}>Explorar todas as sprites</button></div><div className="stats-row">{stats.map(([label,value]) => <article key={label}><span>{label}</span><strong>{Number(value).toLocaleString("pt-BR")}</strong></article>)}</div><div className="technical"><div><span>Assinatura DAT</span><strong>{catalog.datSignature}</strong></div><div><span>Assinatura SPR</span><strong>{catalog.sprSignature}</strong></div><div><span>Armazenamento</span><strong>Local e privado</strong></div></div><div className="tip"><strong>Dica rápida</strong><p>Abra uma categoria, digite um ID ou navegue pelas páginas. Clique em qualquer cartão para copiar o ID.</p></div></> }

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) { if (pages <= 1) return null; return <div className="pagination"><button disabled={page === 1} onClick={() => onChange(1)}>«</button><button disabled={page === 1} onClick={() => onChange(page - 1)}>Anterior</button><span>Página <strong>{page.toLocaleString("pt-BR")}</strong> de {pages.toLocaleString("pt-BR")}</span><button disabled={page === pages} onClick={() => onChange(page + 1)}>Próxima</button><button disabled={page === pages} onClick={() => onChange(pages)}>»</button></div> }
