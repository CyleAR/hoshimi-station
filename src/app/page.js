'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Section icons for file types
// ============================================================
const SECTION_CONFIG = {
  // Card specific
  card: { icon: '🃏', label: '카드 정보', color: '#60a5fa' },
  costume: { icon: '👗', label: '의상', color: '#ec4899' },
  skills: { icon: '⚡', label: '스킬', color: '#f59e0b' },
  stories: { icon: '📖', label: '스토리', color: '#8b5cf6' },
  messages: { icon: '💬', label: '메시지', color: '#10b981' },
  homeTalks: { icon: '🏠', label: '홈 대사', color: '#06b6d4' },
  callPatterns: { icon: '📞', label: '접속 대사', color: '#f97316' },
  evolutionMessages: { icon: '🌸', label: '개화 대사', color: '#ec4899' },
  telephones: { icon: '📱', label: '전화', color: '#a855f7' },
  
  // Events & Stories specific
  info: { icon: 'ℹ️', label: '기본 정보', color: '#60a5fa' },
  adv: { icon: '🎬', label: 'ADV 스크립트', color: '#8b5cf6' }
};

export default function HomePage() {
  // State
  const [category, setCategory] = useState('cards'); // 'cards', 'events', 'stories'
  const [items, setItems] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemDeps, setItemDeps] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCharacter, setFilterCharacter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [advEditorData, setAdvEditorData] = useState(null);
  const [advLoading, setAdvLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const searchRef = useRef(null);

  const fetchItems = async () => {
    setLoading(true);
    setFetchError(null);
    setItems([]);
    try {
      const params = new URLSearchParams();
      if (filterCharacter && category === 'cards') params.set('character', filterCharacter);
      if (searchQuery) params.set('search', searchQuery);
      
      const queryString = params.toString();
      const url = `/api/${category}${queryString ? '?' + queryString : ''}`;
      
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      
      if (category === 'cards') {
        setItems(data.cards || []);
        setCharacters(data.characters || []);
      } else {
        // Simple list for events and stories
        let filteredData = data;
        if (searchQuery) {
          const lowerQ = searchQuery.toLowerCase();
          filteredData = data.filter(d => d.name?.toLowerCase().includes(lowerQ) || d.id?.toLowerCase().includes(lowerQ));
        }
        setItems(filteredData || []);
        setCharacters([]);
      }
    } catch (err) {
      console.error(`Failed to fetch ${category}:`, err);
      setFetchError(err.message || 'Failed to fetch');
    }
    setLoading(false);
  };

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filterCharacter, category]);

  // Load item dependencies
  const selectItem = useCallback(async (item) => {
    setSelectedItem(item);
    setActiveSection(null);
    setAdvEditorData(null);
    setLoadingDeps(true);
    try {
      const idToFetch = category === 'cards' ? item.assetId : item.id;
      const res = await fetch(`/api/${category}/${idToFetch}`, { cache: 'no-store' });
      const data = await res.json();
      setItemDeps(data);
    } catch (err) {
      console.error(`Failed to fetch ${category} deps:`, err);
    }
    setLoadingDeps(false);
  }, [category]);

  // Count items per section
  const getSectionCounts = () => {
    if (!itemDeps) return {};
    
    if (category === 'cards') {
      return {
        card: 1,
        costume: itemDeps.costume ? 1 : 0,
        skills: itemDeps.skills?.length || 0,
        stories: itemDeps.stories?.length || 0,
        messages: itemDeps.messages?.reduce((n, m) => n + (m.details?.length || 0), 0) || 0,
        homeTalks: itemDeps.homeTalks?.length || 0,
        callPatterns: itemDeps.callPatterns?.length || 0,
        evolutionMessages: itemDeps.evolutionMessages?.length || 0,
        telephones: itemDeps.telephones?.length || 0,
      };
    } else {
      return {
        info: itemDeps.dependencies?.info?.length || 0,
        adv: itemDeps.dependencies?.adv?.length || 0,
      };
    }
  };

  // Build translation entries for active section
  const getEditorEntries = () => {
    if (!itemDeps || !activeSection || itemDeps.error) return [];
    const entries = [];

    // Common for generic info and adv
    if (activeSection === 'info' && itemDeps.dependencies?.info) {
      for (const info of itemDeps.dependencies.info) {
        entries.push({ id: info.id, label: info.type, original: info.original });
      }
      return entries;
    }
    if (activeSection === 'adv' && itemDeps.dependencies?.adv) {
      for (const adv of itemDeps.dependencies.adv) {
        entries.push({
          id: `adv|${adv.fileName}`,
          label: adv.type || 'ADV',
          original: adv.fileName,
          isFile: true,
          exists: adv.exists || false,
        });
      }
      return entries;
    }

    // Card specific
    switch (activeSection) {
      case 'card':
        if (itemDeps.card) {
          entries.push(
            { id: `${itemDeps.card.id}|name`, label: '카드명', original: itemDeps.card.name },
            { id: `${itemDeps.card.id}|description`, label: '설명 (글귀)', original: itemDeps.card.description },
            { id: `${itemDeps.card.id}|obtainMessage`, label: '획득 메시지', original: itemDeps.card.obtainMessage },
          );
        }
        break;

      case 'costume':
        if (itemDeps.costume) {
          entries.push({ id: `${itemDeps.costume.id}|name`, label: '의상명', original: itemDeps.costume.name });
        }
        break;

      case 'skills':
        for (const sk of itemDeps.skills) {
          entries.push({ id: `${sk.id}|name`, label: `스킬명`, original: sk.name });
          for (const lvl of sk.levels) {
            entries.push({
              id: `${sk.id}|level.${lvl.level}.description`,
              label: `Lv.${lvl.level} 설명`,
              original: lvl.description,
            });
          }
        }
        break;

      case 'stories':
        for (const st of itemDeps.stories) {
          entries.push({ id: `${st.id}|name`, label: '에피소드 제목', original: st.name });
          if (st.description) {
            entries.push({ id: `${st.id}|description`, label: '에피소드 설명', original: st.description });
          }
          for (const adv of st.advFiles) {
            entries.push({
              id: `adv|${adv.filename}`,
              label: `ADV 스크립트`,
              original: adv.filename,
              isFile: true,
              exists: adv.exists,
            });
          }
        }
        break;

      case 'messages':
        for (const group of itemDeps.messages) {
          for (const d of group.details) {
            entries.push({
              id: `${group.id}|detail.${d.messageDetailId}.text`,
              label: `[${d.messageDetailId}]`,
              original: d.text,
            });
            if (d.choiceText) {
              entries.push({
                id: `${group.id}|detail.${d.messageDetailId}.choiceText`,
                label: `[${d.messageDetailId}] 선택지`,
                original: d.choiceText,
              });
            }
          }
        }
        break;

      case 'homeTalks':
        for (const ht of itemDeps.homeTalks) {
          if (ht.choiceText) {
            entries.push({ id: `${ht.id}|choiceText`, label: '선택지', original: ht.choiceText });
          }
          if (ht.managerText) {
            entries.push({ id: `${ht.id}|managerText`, label: '매니저 텍스트', original: ht.managerText });
          }
          for (let i = 0; i < ht.characterTalks.length; i++) {
            entries.push({
              id: `${ht.id}|talk.${i}`,
              label: `대사 ${i + 1}`,
              original: ht.characterTalks[i].text,
            });
          }
        }
        break;

      case 'callPatterns':
        for (const cp of itemDeps.callPatterns) {
          entries.push(
            { id: `${cp.patternId}|characterArrivalText`, label: '캐릭터 대사', original: cp.characterArrivalText },
            { id: `${cp.patternId}|managerCallText`, label: '매니저 대사', original: cp.managerCallText },
          );
        }
        break;

      case 'evolutionMessages':
        for (const em of itemDeps.evolutionMessages) {
          entries.push({
            id: `${em.cardId}|evo.${em.evolutionLevel}.${em.number}`,
            label: `개화 ${em.evolutionLevel} - ${em.number}`,
            original: em.evolveMessage,
          });
        }
        break;

      case 'telephones':
        for (const tel of itemDeps.telephones) {
          entries.push({
            id: `${tel.id}|name`,
            label: '전화',
            original: tel.name || tel.id,
          });
        }
        break;
    }

    return entries.filter(e => e.original);
  };

  const sectionCounts = getSectionCounts();
  const editorEntries = getEditorEntries();

  // Keyboard shortcut: Ctrl+K for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-layout">
      {/* ============ Header ============ */}
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">⭐</div>
          <span>HoshimiStation</span>
        </div>

        <div className="app-search">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="카드 검색... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="header-actions">
          <button className="btn btn-secondary btn-sm">
            ⟳ Sync
          </button>
          <button className="btn btn-primary btn-sm">
            📥 Export
          </button>
        </div>
      </header>

      {/* ============ Main Panels ============ */}
      <main className="app-main">
        {/* ---- Left Panel: Card List ---- */}
        <aside className="panel panel-left">
          <div className="panel-header" style={{ paddingBottom: 'var(--space-sm)' }}>
            <h2>콘텐츠 목록</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {items.length}
            </span>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', padding: '0 var(--space-lg) var(--space-md)', borderBottom: '2px solid var(--border-primary)', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
            <button 
              className={`filter-chip ${category === 'cards' ? 'active' : ''}`}
              onClick={() => { setCategory('cards'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >카드</button>
            <button 
              className={`filter-chip ${category === 'characters' ? 'active' : ''}`}
              onClick={() => { setCategory('characters'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >아이돌</button>
            <button 
              className={`filter-chip ${category === 'generic' ? 'active' : ''}`}
              onClick={() => { setCategory('generic'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >일반</button>
            <button 
              className={`filter-chip ${category === 'events' ? 'active' : ''}`}
              onClick={() => { setCategory('events'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >이벤트</button>
            <button 
              className={`filter-chip ${category === 'stories' ? 'active' : ''}`}
              onClick={() => { setCategory('stories'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >스토리</button>
            <button 
              className={`filter-chip ${category === 'extras' ? 'active' : ''}`}
              onClick={() => { setCategory('extras'); setSelectedItem(null); setItemDeps(null); }}
              style={{ flex: '1 0 15%', textAlign: 'center', padding: '5px 8px' }}
            >기타</button>
          </div>

          {/* Character Filter (Cards Only) */}
          {category === 'cards' && (
            <div className="filter-chips">
              <button
                className={`filter-chip ${!filterCharacter ? 'active' : ''}`}
                onClick={() => setFilterCharacter('')}
              >
                전체
              </button>
              {characters.map(ch => (
                <button
                  key={ch.id}
                  className={`filter-chip ${filterCharacter === ch.id ? 'active' : ''}`}
                  onClick={() => setFilterCharacter(filterCharacter === ch.id ? '' : ch.id)}
                >
                  {ch.short}
                </button>
              ))}
            </div>
          )}

          {/* Item List */}
          <div className="item-list-container">
            {fetchError ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--status-untranslated)' }}>
                에러가 발생했습니다: {fetchError}
              </div>
            ) : loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>로딩 중...</div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>결과가 없습니다</div>
            ) : (
              <div className="item-list">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`card-item ${selectedItem?.id === item.id ? 'active' : ''}`}
                    onClick={() => selectItem(item)}
                  >
                    {category === 'cards' && (
                      <span className="card-rarity" data-rarity={item.initialRarity}>
                        ★{item.initialRarity}
                      </span>
                    )}
                    <div className="card-info">
                      <div className="card-name">{item.name}</div>
                      <div className="card-meta">{item.assetId || item.id}</div>
                      <div className="card-progress">
                        <div className="card-progress-fill" style={{ width: '0%' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ---- Middle Panel: File Tree ---- */}
        <div className="panel panel-middle">
          <div className="panel-header">
            <h2>관련 파일</h2>
          </div>

          <div className="panel-content">
            {!selectedItem ? (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ← 왼쪽에서 항목을 선택하세요
              </div>
            ) : loadingDeps ? (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                불러오는 중...
              </div>
            ) : itemDeps ? (
              Object.entries(SECTION_CONFIG).map(([key, config]) => {
                const count = sectionCounts[key] || 0;
                if (count === 0) return null;
                return (
                  <div key={key} className="file-section fade-in">
                    <div
                      className={`file-section-header ${activeSection === key ? 'active' : ''}`}
                      onClick={() => setActiveSection(activeSection === key ? null : key)}
                      style={activeSection === key ? { background: 'var(--bg-active)', color: config.color } : {}}
                    >
                      <span className="file-section-icon">{config.icon}</span>
                      <span>{config.label}</span>
                      <span className="file-section-count">{count}</span>
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>
        </div>

        {/* ---- Right Panel: Translation Editor ---- */}
        <div className="panel panel-right">
          {advEditorData ? (
            /* ================= ADV EDITOR ================= */
            <>
              <div className="editor-toolbar">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAdvEditorData(null)}
                >
                  ← 돌아가기
                </button>
                <span className="editor-title" style={{ marginLeft: 'var(--space-md)' }}>🎬 ADV 에디터</span>
                <span className="editor-subtitle">{advEditorData.filename}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn-success btn-sm">💾 저장 (Phase 2)</button>
                </div>
              </div>

              <div className="editor-entries">
                {advLoading ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    파일을 불러오는 중...
                  </div>
                ) : advEditorData.error ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--error-color)' }}>
                    에러: {advEditorData.error}
                  </div>
                ) : !advEditorData.entries || advEditorData.entries.length === 0 ? (
                  <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    이 스크립트에는 대사나 선택지가 없습니다.
                  </div>
                ) : (
                  advEditorData.entries.map((entry, idx) => (
                    <div key={idx} className="translation-entry fade-in" style={{ animationDelay: `${Math.min(idx, 20) * 20}ms` }}>
                      <div className="entry-header">
                        <span className="entry-label" style={{ 
                          background: entry.type === 'choice' ? 'var(--primary-dark)' : 
                                      entry.type === 'title' ? 'var(--accent-primary)' :
                                      entry.type === 'narration' ? 'var(--border-primary)' : 'var(--bg-secondary)',
                          color: (entry.type === 'title' || entry.type === 'narration') ? 'white' : 'var(--text-primary)'
                        }}>
                          {entry.type === 'choice' ? '선택지' : 
                           entry.type === 'title' ? '제목 (Title)' :
                           entry.type === 'narration' ? '독백 (Narration)' :
                           (entry.name || '대사')}
                        </span>
                        <span className="entry-id">Line {entry.lineIndex + 1}</span>
                      </div>

                      <div className="entry-row">
                        <div className="entry-row-label original">원문</div>
                        <div className="entry-row-value">{entry.original}</div>
                      </div>

                      <div className="entry-row">
                        <div className="entry-row-label new">번역</div>
                        <div className="entry-row-value">
                          <textarea
                            placeholder="번역을 입력하세요..."
                            rows={Math.max(1, (entry.original?.split('\n')?.length || 1))}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : !activeSection ? (
            /* ================= EMPTY STATE ================= */
            <div className="editor-empty">
              <div className="editor-empty-icon">📝</div>
              <div className="editor-empty-text">
                {selectedItem
                  ? '가운데 패널에서 항목을 선택하세요'
                  : '왼쪽에서 항목을 선택하면 번역 편집을 시작할 수 있습니다'}
              </div>
            </div>
          ) : (
            /* ================= NORMAL EDITOR ================= */
            <>
              <div className="editor-toolbar">
                <span style={{ fontSize: '1.1rem' }}>{SECTION_CONFIG[activeSection]?.icon}</span>
                <span className="editor-title">{SECTION_CONFIG[activeSection]?.label}</span>
                <span className="editor-subtitle">{selectedItem?.name}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn-secondary btn-sm">⟳ 되돌리기</button>
                  <button className="btn btn-success btn-sm">💾 저장</button>
                </div>
              </div>

              <div className="editor-entries">
                {editorEntries.map((entry, idx) => (
                  <div key={entry.id} className="translation-entry fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                    <div className="entry-header">
                      <span className="entry-label">{entry.label}</span>
                      <span className="entry-id">{entry.id}</span>
                    </div>

                    {!entry.isFile ? (
                      <>
                        <div className="entry-row">
                          <div className="entry-row-label original">원문</div>
                          <div className="entry-row-value">{entry.original}</div>
                        </div>

                        <div className="entry-row">
                          <div className="entry-row-label current">현재</div>
                          <div className="entry-row-value muted">(미번역)</div>
                        </div>

                        <div className="entry-row">
                          <div className="entry-row-label new">번역</div>
                          <div className="entry-row-value">
                            <textarea
                              placeholder="번역을 입력하세요..."
                              rows={Math.max(1, (entry.original?.split('\n')?.length || 1))}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="entry-row" style={{ alignItems: 'center' }}>
                        <div className="entry-row-value" style={{ fontFamily: 'monospace', flex: 1 }}>
                          📄 {entry.original}
                        </div>
                        {entry.exists ? (
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              setAdvLoading(true);
                              setAdvEditorData({ filename: entry.original, entries: [] });
                              try {
                                const res = await fetch(`/api/adv/${entry.original}`, { cache: 'no-store' });
                                const data = await res.json();
                                setAdvEditorData(data);
                              } catch (e) {
                                console.error(e);
                                setAdvEditorData({ filename: entry.original, error: e.message });
                              }
                              setAdvLoading(false);
                            }}
                          >
                            에디터 열기 →
                          </button>
                        ) : (
                          <span className="status-badge untranslated">파일 없음</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {editorEntries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>
                    이 섹션에 번역 가능한 항목이 없습니다
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </main>
    </div>
  );
}
