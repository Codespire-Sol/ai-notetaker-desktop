import { useState, useRef, useEffect } from 'react'
import logo from '../assets/codespire-logo.png'

export default function Lock({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async (e) => {
    e.preventDefault()
    const res = await window.api.verifyPin(pin)
    if (res.ok) onUnlock()
    else { setErr('Incorrect PIN'); setPin('') }
  }

  return (
    <div className="lock">
      <form className="box" onSubmit={submit}>
        <div className="logo-chip" style={{ maxWidth: 190, margin: '0 auto 20px' }}><img src={logo} alt="Codespire" /></div>
        <h1>Notetaker</h1>
        <p>Enter your PIN to unlock</p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={12}
          value={pin}
          onChange={(e) => { setErr(''); setPin(e.target.value.replace(/\D/g, '')) }}
          placeholder="••••"
        />
        <div className="err">{err}</div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={pin.length < 4}>
          Unlock
        </button>
      </form>
    </div>
  )
}
