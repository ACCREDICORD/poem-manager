import { useState } from 'react'
import PoemList from './components/PoemList.jsx'
import PoemDetail from './components/PoemDetail.jsx'
import PoemEditor from './components/PoemEditor.jsx'

export default function App() {
  const [view, setView] = useState('list') // list | detail | edit
  const [selectedId, setSelectedId] = useState(null)
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

  if (view === 'detail') {
    return (
      <PoemDetail
        id={selectedId}
        onBack={backToList}
        onEdit={openEdit}
        onDeleted={backToList}
      />
    )
  }
  if (view === 'edit') {
    return (
      <PoemEditor
        id={selectedId}
        onSaved={backToList}
        onCancel={() => (selectedId ? openDetail(selectedId) : backToList())}
        refresh={refresh}
      />
    )
  }
  return <PoemList refreshKey={refreshKey} onSelect={openDetail} onNew={openNew} />
}
