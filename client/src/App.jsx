import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import trLocale from '@fullcalendar/core/locales/tr'

function App() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')

  const fetchAppointments = () => {
    fetch('http://localhost:3000/api/appointments')
      .then(res => res.json())
      .then(data => {
        setAppointments(data)
        setLoading(false)
      })
      .catch(err => console.error("Veri çekilemedi:", err))
  }

  useEffect(() => {
    fetchAppointments()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!customerName || !date || !time) return alert("İsim, Tarih ve Saat alanları zorunludur!")

    fetch('http://localhost:3000/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: customerName, phone, date, time, note })
    })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bir hata oluştu");
      return data;
    })
    .then(() => {
      setCustomerName(''); setPhone(''); setDate(''); setTime(''); setNote('');
      fetchAppointments()
    })
    .catch(err => alert(err.message))
  }

  const handleEventClick = (info) => {
    const appData = info.event.extendedProps;
    if (window.confirm(`Müşteri: ${info.event.title}\nTelefon: ${appData.phone}\nNot: ${appData.note}\n\nBu randevuyu iptal etmek istiyor musunuz?`)) {
      fetch(`http://localhost:3000/api/appointments/${info.event.id}`, { method: 'DELETE' })
      .then(() => fetchAppointments())
    }
  }

  const handleEventDropOrResize = (info) => {
    const id = info.event.id;
    const newDateTime = info.event.start;
    if (!newDateTime) return;

    // ISO formatını yerel saate göre parçalayalım
    const datePart = newDateTime.toLocaleDateString('sv-SE'); // YYYY-MM-DD formatı verir
    const timePart = newDateTime.toTimeString().split(' ')[0].substring(0, 5); // HH:mm formatı verir

    fetch(`http://localhost:3000/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: datePart, time: timePart })
    })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Güncelleme başarısız");
      return data;
    })
    .then(() => {
      fetchAppointments();
    })
    .catch(err => {
      alert(err.message);
      info.revert(); // Hata durumunda kutuyu eski yerine geri fırlatır
    });
  }

  const events = appointments.map(app => ({
    id: app.id,
    title: app.customer_name,
    start: `${app.date}T${app.time}:00`, 
    extendedProps: {
      phone: app.phone || 'Yok',
      note: app.note || '-'
    }
  }))

  const todayStr = new Date().toLocaleDateString('sv-SE');

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <h1>📅 Akıllı Randevu Takip Sistemi</h1>
      <hr style={{ borderColor: '#333' }} />
      
      {/* 📊 DASHBOARD */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', marginTop: '10px' }}>
        <div style={{ flex: 1, background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#aaa' }}>📋 Toplam Randevu</h4>
          <h2 style={{ margin: 0, color: '#007bff' }}>{appointments.length} <span style={{ fontSize: '14px', color: '#666' }}>Kayıt</span></h2>
        </div>
        <div style={{ flex: 1, background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#aaa' }}>🔥 Bugünün Randevuları</h4>
          <h2 style={{ margin: 0, color: '#2ecc71' }}>
            {appointments.filter(app => app.date === todayStr).length} <span style={{ fontSize: '14px', color: '#666' }}>Kişi</span>
          </h2>
        </div>
      </div>

      {/* ➕ YENİ RANDEVU EKLEME FORMU */}
      <div style={{ background: '#222', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
        <h3>➕ Yeni Randevu Oluştur</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Müşteri Adı" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff', flex: 1 }} />
          <input type="text" placeholder="Telefon" value={phone} onChange={e => setPhone(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff', flex: 1 }} />
          <input type="date" value={date} min={todayStr} onChange={e => setDate(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff' }} />
          <input type="text" placeholder="Not (Örn: Saç+Sakal)" value={note} onChange={e => setNote(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff', flex: 1 }} />
          <button type="submit" style={{ padding: '8px 15px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Ekle</button>
        </form>
      </div>

      {/* 🗓️ TAKVİM GÖRÜNÜMÜ */}
      <h2>Randevu Ajandası</h2>
      {loading ? (
        <p>Yükleniyor...</p>
      ) : (
        <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333', color: '#fff' }}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            locale={trLocale}
            events={events}
            eventClick={handleEventClick}
            eventColor='#007bff'
            height="600px"
            editable={true}
            selectable={true}
            eventDrop={handleEventDropOrResize}
            eventResize={handleEventDropOrResize}
          />
        </div>
      )}
    </div>
  )
}

export default App