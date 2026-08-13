import { useState } from 'react'
import PoemList from './components/PoemList.jsx'
import PoemDetail from './components/PoemDetail.jsx'
import PoemEditor from './components/PoemEditor.jsx'
import TemplateList from './components/TemplateList.jsx'
import TemplateDetail from './components/TemplateDetail.jsx'
import TemplateEditor from './components/TemplateEditor.jsx'

export default function App() {
  const [tab, setTab] = useState('poems') // poems | templates
  const [view, setView] = useState('list') // list | detail | edit
  const [selectedId, setSelectedId] = useState(null)
  const [tplView, setTplView] = useState('list')
  const [tplId, setTplId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

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

  let content
  if (tab === 'templates') {
    if (tplView === 'detail') {
      content = (
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
      content = (
        <TemplateEditor
          id={tplId}
          onSaved={() => setTplView('list')}
          onCancel={() => (tplId ? setTplView('detail') : setTplView('list'))}
        />
      )
    } else {
      content = (
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
  } else if (view === 'detail') {
    content = (
      <PoemDetail id={selectedId} onBack={backToList} onEdit={openEdit} onDeleted={backToList} />
    )
  } else if (view === 'edit') {
    content = (
      <PoemEditor
        id={selectedId}
        onSaved={backToList}
        onCancel={() => (selectedId ? openDetail(selectedId) : backToList())}
        refresh={refresh}
      />
    )
  } else {
    content = <PoemList refreshKey={refreshKey} onSelect={openDetail} onNew={openNew} />
  }

  return (
    <div>
      {content}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <TabBtn active={tab === 'poems'} onClick={() => setTab('poems')}>
          诗词
        </TabBtn>
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')}>
          格律
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
