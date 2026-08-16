import { useEffect, useState } from 'react'
import { getToken } from './api.js'
import { startSyncEngine, stopSyncEngine } from './sync.js'
import Login from './components/Login.jsx'
import StatusIndicator from './components/StatusIndicator.jsx'
import PoemList from './components/PoemList.jsx'
import PoemDetail from './components/PoemDetail.jsx'
import PoemEditor from './components/PoemEditor.jsx'
import TemplateList from './components/TemplateList.jsx'
import TemplateDetail from './components/TemplateDetail.jsx'
import TemplateEditor from './components/TemplateEditor.jsx'
import ReferenceList from './components/ReferenceList.jsx'
import ReferenceEditor from './components/ReferenceEditor.jsx'

export default function App() {
  const [tab, setTab] = useState('poems') // poems | templates
  const [view, setView] = useState('list') // list | detail | edit
  const [selectedId, setSelectedId] = useState(null)
  const [tplView, setTplView] = useState('list')
  const [tplId, setTplId] = useState(null)
  const [refView, setRefView] = useState('list')
  const [refId, setRefId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [authed, setAuthed] = useState(!!getToken())

  useEffect(() => {
    if (!authed) return
    startSyncEngine()
    return () => stopSyncEngine()
  }, [authed])

  useEffect(() => {
    const onUnauth = () => setAuthed(false)
    window.addEventListener('auth:unauthorized', onUnauth)
    return () => window.removeEventListener('auth:unauthorized', onUnauth)
  }, [])

  const refresh = () => setRefreshKey((k) => k + 1)

  const openDetail = (id) => {
    setSelectedId(id)
    setView('detail')
  }
  const openEdit = (id) => {
    setSelectedId(id)
    setView('edit')
  }
  const openNew = () => {
    setSelectedId(null)
    setView('edit')
  }
  const backToList = () => {
    setSelectedId(null)
    setView('list')
  }

  // 三个标签页各自独立渲染，切换时用 CSS 隐藏而非卸载——
  // 避免每次切换都重新请求数据（在移动网络下会感觉"切页等几秒"）。
  const referencesContent =
    refView === 'edit' ? (
      <ReferenceEditor
        id={refId}
        onSaved={() => setRefView('list')}
        onCancel={() => setRefView('list')}
      />
    ) : (
      <ReferenceList
        onSelect={(id) => {
          setRefId(id)
          setRefView('edit')
        }}
        onNew={() => {
          setRefId(null)
          setRefView('edit')
        }}
      />
    )

  let templatesContent
  if (tplView === 'detail') {
    templatesContent = (
      <TemplateDetail
        id={tplId}
        onBack={() => setTplView('list')}
        onEdit={(id) => {
          setTplId(id)
          setTplView('edit')
        }}
        onDeleted={() => setTplView('list')}
      />
    )
  } else if (tplView === 'edit') {
    templatesContent = (
      <TemplateEditor
        id={tplId}
        onSaved={() => setTplView('list')}
        onCancel={() => (tplId ? setTplView('detail') : setTplView('list'))}
      />
    )
  } else {
    templatesContent = (
      <TemplateList
        onSelect={(id) => {
          setTplId(id)
          setTplView('detail')
        }}
        onNew={() => {
          setTplId(null)
          setTplView('edit')
        }}
      />
    )
  }

  let poemsContent
  if (view === 'detail') {
    poemsContent = (
      <PoemDetail id={selectedId} onBack={backToList} onEdit={openEdit} onDeleted={backToList} />
    )
  } else if (view === 'edit') {
    poemsContent = (
      <PoemEditor
        id={selectedId}
        onSaved={backToList}
        onCancel={() => (selectedId ? openDetail(selectedId) : backToList())}
        refresh={refresh}
      />
    )
  } else {
    poemsContent = <PoemList refreshKey={refreshKey} onSelect={openDetail} onNew={openNew} />
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  return (
    <div>
      <StatusIndicator />
      <div className={tab === 'poems' ? '' : 'hidden'}>{poemsContent}</div>
      <div className={tab === 'templates' ? '' : 'hidden'}>{templatesContent}</div>
      <div className={tab === 'references' ? '' : 'hidden'}>{referencesContent}</div>
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <TabBtn active={tab === 'poems'} onClick={() => setTab('poems')}>
          诗词
        </TabBtn>
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')}>
          格律
        </TabBtn>
        <TabBtn active={tab === 'references'} onClick={() => setTab('references')}>
          参考
        </TabBtn>
      </nav>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium transition ${
        active ? 'text-teal-700' : 'text-slate-400'
      }`}
    >
      {children}
    </button>
  )
}
