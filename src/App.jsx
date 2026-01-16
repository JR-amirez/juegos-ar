import { useState } from 'react'
import './App.css'
import CalculoMental from './games/CalculoMental'
import Encriptacion from './games/Encriptacion'
import Blockly from './games/Blockly'

const menuItems = [
  { id: 'inicio', label: 'Inicio', subtitle: 'Pantalla principal' },
  { id: 'embed-1', label: 'Cálculo Mental' },
  { id: 'embed-2', label: 'Encriptación' },
  { id: 'embed-3', label: 'Programación por bloques' },
]

function EmbedPlaceholder({ title, id }) {
  return (
    <section className="panel embed-panel">
      <header className="panel-header">
        {/* <h1>{title}</h1> */}
      </header>
      <div className="embed-placeholder">
        <div className="embed-screen">
          { id === 'embed-1' ? <CalculoMental /> : id === 'embed-2' ? <Encriptacion /> : <Blockly /> }
        </div>
      </div>
    </section>
  )
}

function App() {
  const [activeId, setActiveId] = useState(menuItems[0].id)
  const activeItem = menuItems.find((item) => item.id === activeId)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AR</div>
          <div>
            <p className="brand-title">Juegos AR</p>
            <p className="brand-subtitle">Panel central</p>
          </div>
        </div>
        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`menu-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => setActiveId(item.id)}
            >
              <span className="menu-label">{item.label}</span>
              <span className="menu-sub">{item.subtitle}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {activeId === 'inicio' ? (
          <section className="panel hero-panel">
            <div className="hero-header">
              <p className="eyebrow">Panel principal</p>
              
            </div>
          </section>
        ) : (
          <EmbedPlaceholder title={activeItem?.label ?? 'Componente'} id={activeItem?.id} />
        )}
      </main>
    </div>
  )
}

export default App
