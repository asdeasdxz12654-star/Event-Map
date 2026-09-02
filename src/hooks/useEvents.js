import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// Firestore 'EventMap' 컬렉션을 실시간 구독한다.
export function useEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'EventMap'),
      snapshot => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        list.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
        setEvents(list)
        setLoading(false)
      },
      err => {
        setError(err)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [])

  return { events, loading, error }
}
