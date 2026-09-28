// Supabase конфигурация
const SUPABASE_URL = 'https://ufrdpcuxhxyneykzaczt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcmRwY3V4aHh5bmV5a3phY3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyODQ2OTcsImV4cCI6MjA3ODg2MDY5N30.ewVZUh_M6Tp7KarKX1DLFaX8X1IJoFIY7aKPiDV8uMw';

// Инициализация Supabase клиента
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Хеширование пароля (SHA-256)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// Проверка авторизации
async function checkAuth() {
    const userData = localStorage.getItem('user');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            showAuthenticatedView(user);
        } catch (e) {
            localStorage.removeItem('user');
            showUnauthenticatedView();
        }
    } else {
        showUnauthenticatedView();
    }
}

// Показать вид для авторизованного пользователя
function showAuthenticatedView(user) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('main-section').classList.remove('hidden');
    document.getElementById('user-info').textContent = `Пользователь: ${user.username}`;
    loadMyGames();
    loadStatistics();
    loadRecommendations();
}

// Показать вид для неавторизованного пользователя
function showUnauthenticatedView() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('main-section').classList.add('hidden');
}

// Регистрация
async function register() {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    if (!username || !email || !password) {
        showAlert('Заполните все поля', 'error');
        return;
    }
    
    try {
        // Хешируем пароль
        const passwordHash = await hashPassword(password);
        
        // Проверяем, существует ли пользователь
        const { data: existingUser } = await supabaseClient
            .from('users')
            .select('id')
            .or(`username.eq.${username},email.eq.${email}`)
            .limit(1);
        
        if (existingUser && existingUser.length > 0) {
            showAlert('Пользователь с таким именем или email уже существует', 'error');
            return;
        }
        
        // Создаем нового пользователя
        const { data, error } = await supabaseClient
            .from('users')
            .insert({
                username: username,
                email: email,
                password_hash: passwordHash
            })
            .select()
            .single();
        
        if (error) {
            throw error;
        }
        
        if (data) {
            const user = { id: data.id, username: data.username };
            localStorage.setItem('user', JSON.stringify(user));
            showAlert('Регистрация успешна!', 'success');
            checkAuth();
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showAlert(error.message || 'Ошибка регистрации', 'error');
    }
}

// Вход
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showAlert('Заполните все поля', 'error');
        return;
    }
    
    try {
        // Хешируем пароль
        const passwordHash = await hashPassword(password);
        
        // Ищем пользователя
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, username, password_hash')
            .eq('username', username)
            .single();
        
        if (error || !data) {
            showAlert('Неверное имя пользователя или пароль', 'error');
            return;
        }
        
        // Проверяем пароль
        if (data.password_hash !== passwordHash) {
            showAlert('Неверное имя пользователя или пароль', 'error');
            return;
        }
        
        // Сохраняем пользователя
        const user = { id: data.id, username: data.username };
        localStorage.setItem('user', JSON.stringify(user));
        showAlert('Вход выполнен!', 'success');
        checkAuth();
    } catch (error) {
        console.error('Ошибка входа:', error);
        showAlert(error.message || 'Ошибка входа', 'error');
    }
}

// Выход
function logout() {
    localStorage.removeItem('user');
    showUnauthenticatedView();
    showAlert('Выход выполнен', 'info');
}

// Переключение между регистрацией и входом
function showRegister() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
}

// Загрузка справочника игр
async function loadGames() {
    try {
        const { data: games, error } = await supabaseClient
            .from('games')
            .select(`
                id, 
                title, 
                developer, 
                publisher, 
                release_year, 
                description,
                game_genres (
                    genres (name)
                )
            `);
        
        if (error) throw error;
        
        const formattedGames = games.map(game => ({
            id: game.id,
            title: game.title,
            developer: game.developer,
            publisher: game.publisher,
            release_year: game.release_year,
            description: game.description,
            genres: game.game_genres?.map(g => g.genres?.name).filter(Boolean) || []
        }));
        
        displayGames(formattedGames, 'games-container');
    } catch (error) {
        console.error('Ошибка загрузки игр:', error);
        showAlert('Ошибка загрузки игр', 'error');
    }
}

// Загрузка моей коллекции
async function loadMyGames() {
    const userData = localStorage.getItem('user');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    
    try {
        const { data: userGames, error } = await supabaseClient
            .from('user_games')
            .select(`
                id,
                game_id,
                hours_played,
                status,
                added_at,
                games (
                    id,
                    title,
                    developer,
                    publisher,
                    release_year,
                    description,
                    game_genres (
                        genres (name)
                    )
                )
            `)
            .eq('user_id', user.id)
            .order('added_at', { ascending: false });
        
        if (error) throw error;
        
        const formattedGames = userGames.map(item => ({
            id: item.id,
            game_id: item.game_id,
            hours_played: item.hours_played || 0,
            status: item.status || 'owned',
            added_at: item.added_at,
            title: item.games?.title,
            developer: item.games?.developer,
            publisher: item.games?.publisher,
            release_year: item.games?.release_year,
            description: item.games?.description,
            genres: item.games?.game_genres?.map(g => g.genres?.name).filter(Boolean) || []
        }));
        
        displayMyGames(formattedGames);
    } catch (error) {
        console.error('Ошибка загрузки коллекции:', error);
        showAlert('Ошибка загрузки коллекции', 'error');
    }
}

// Отображение игр
function displayGames(games, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<p>Игры не найдены</p>';
        return;
    }
    
    games.forEach(game => {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        
        // Формируем список жанров
        const genresHtml = game.genres && game.genres.length > 0
            ? game.genres.map(genre => `<span class="genre">${genre}</span>`).join(' ')
            : '<span class="genre">Без жанра</span>';
        
        gameCard.innerHTML = `
            <h3>${game.title}</h3>
            <p><strong>Разработчик:</strong> ${game.developer || 'Не указан'}</p>
            <p><strong>Издатель:</strong> ${game.publisher || 'Не указан'}</p>
            <p><strong>Год:</strong> ${game.release_year || 'Не указан'}</p>
            <p>${game.description || ''}</p>
            <div style="margin-top: 10px;">${genresHtml}</div>
            <div class="actions">
                <button class="btn btn-success" onclick="addToCollection(${game.id})">Добавить в коллекцию</button>
            </div>
        `;
        container.appendChild(gameCard);
    });
}

// Отображение моей коллекции
function displayMyGames(games) {
    const container = document.getElementById('my-games-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<p>Ваша коллекция пуста. Добавьте игры из справочника!</p>';
        return;
    }
    
    games.forEach(game => {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        gameCard.innerHTML = `
            <h3>${game.title}</h3>
            <p><strong>Разработчик:</strong> ${game.developer || 'Не указан'}</p>
            <p><strong>Жанры:</strong> ${game.genres && game.genres.length > 0 ? game.genres.join(', ') : 'Без жанра'}</p>
            <p><strong>Часов наиграно:</strong> ${game.hours_played || 0}</p>
            <p><strong>Статус:</strong> ${game.status || 'owned'}</p>
            <div class="actions">
                <button class="btn btn-secondary" onclick="openEditModal(${game.game_id}, ${game.hours_played || 0}, '${game.status || 'owned'}')">Редактировать</button>
                <button class="btn btn-danger" onclick="removeFromCollection(${game.game_id})">Удалить</button>
            </div>
        `;
        container.appendChild(gameCard);
    });
}

// Добавление игры в коллекцию
async function addToCollection(gameId) {
    const userData = localStorage.getItem('user');
    if (!userData) {
        showAlert('Необходима авторизация', 'error');
        return;
    }
    
    const user = JSON.parse(userData);
    
    try {
        // Проверяем, есть ли уже игра в коллекции
        const { data: existing } = await supabaseClient
            .from('user_games')
            .select('id')
            .eq('user_id', user.id)
            .eq('game_id', gameId)
            .single();
        
        if (existing) {
            showAlert('Игра уже в коллекции!', 'error');
            return;
        }
        
        const { error } = await supabaseClient
            .from('user_games')
            .insert({
                user_id: user.id,
                game_id: gameId,
                hours_played: 0,
                status: 'owned'
            });
        
        if (error) throw error;
        
        showAlert('Игра добавлена в коллекцию!', 'success');
        loadMyGames();
        loadStatistics();
        loadRecommendations();
    } catch (error) {
        console.error('Ошибка добавления:', error);
        showAlert(error.message || 'Ошибка добавления игры', 'error');
    }
}

// Удаление игры из коллекции
async function removeFromCollection(gameId) {
    if (!confirm('Удалить игру из коллекции?')) return;
    
    const userData = localStorage.getItem('user');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    
    try {
        const { error } = await supabaseClient
            .from('user_games')
            .delete()
            .eq('user_id', user.id)
            .eq('game_id', gameId);
        
        if (error) throw error;
        
        showAlert('Игра удалена из коллекции', 'success');
        loadMyGames();
        loadStatistics();
        loadRecommendations();
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showAlert(error.message || 'Ошибка удаления', 'error');
    }
}

// Открытие модального окна редактирования
function openEditModal(gameId, hoursPlayed, status) {
    document.getElementById('edit-game-id').value = gameId;
    document.getElementById('edit-hours').value = hoursPlayed;
    document.getElementById('edit-status').value = status;
    document.getElementById('editModal').style.display = 'block';
}

// Закрытие модального окна
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// Сохранение изменений
async function saveGameChanges() {
    const gameId = document.getElementById('edit-game-id').value;
    const hoursPlayed = parseFloat(document.getElementById('edit-hours').value) || 0;
    const status = document.getElementById('edit-status').value;
    
    const userData = localStorage.getItem('user');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    
    try {
        const { error } = await supabaseClient
            .from('user_games')
            .update({
                hours_played: hoursPlayed,
                status: status
            })
            .eq('user_id', user.id)
            .eq('game_id', gameId);
        
        if (error) throw error;
        
        showAlert('Изменения сохранены!', 'success');
        closeEditModal();
        loadMyGames();
        loadStatistics();
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showAlert(error.message || 'Ошибка сохранения', 'error');
    }
}

// Загрузка статистики
async function loadStatistics() {
    const userData = localStorage.getItem('user');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    
    try {
        const { data: userGames, error } = await supabaseClient
            .from('user_games')
            .select(`
                hours_played,
                games (
                    game_genres (
                        genres (name)
                    )
                )
            `)
            .eq('user_id', user.id);
        
        if (error) throw error;
        
        if (!userGames || userGames.length === 0) {
            displayStatistics({
                total_games: 0,
                total_hours: 0,
                genre_stats: [],
                predominant_genre: null
            });
            return;
        }
        
        const total_games = userGames.length;
        const total_hours = userGames.reduce((sum, item) => sum + (item.hours_played || 0), 0);
        
        // Подсчет статистики по жанрам (учитываем все жанры каждой игры)
        const genreStatsDict = {};
        userGames.forEach(item => {
            const hours = item.hours_played || 0;
            const genres = item.games?.game_genres?.map(g => g.genres?.name).filter(Boolean) || [];
            
            if (genres.length === 0) {
                const genreName = 'Без жанра';
                if (!genreStatsDict[genreName]) {
                    genreStatsDict[genreName] = { count: 0, hours: 0 };
                }
                genreStatsDict[genreName].count += 1;
                genreStatsDict[genreName].hours += hours;
            } else {
                // Каждый жанр игры учитывается отдельно
                genres.forEach(genreName => {
                    if (!genreStatsDict[genreName]) {
                        genreStatsDict[genreName] = { count: 0, hours: 0 };
                    }
                    genreStatsDict[genreName].count += 1;
                    genreStatsDict[genreName].hours += hours / genres.length; // Часы делятся между жанрами
                });
            }
        });
        
        const genre_stats = Object.entries(genreStatsDict).map(([genre, stats]) => ({
            genre,
            count: stats.count,
            hours: stats.hours
        })).sort((a, b) => (b.count - a.count) || (b.hours - a.hours));
        
        const predominant_genre = genre_stats.length > 0 ? genre_stats[0].genre : null;
        
        displayStatistics({
            total_games,
            total_hours: Math.round(total_hours * 10) / 10,
            genre_stats,
            predominant_genre
        });
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        showAlert('Ошибка загрузки статистики', 'error');
    }
}

// Отображение статистики
function displayStatistics(stats) {
    document.getElementById('total-games').textContent = stats.total_games;
    document.getElementById('total-hours').textContent = stats.total_hours.toFixed(1);
    
    const genreStatsContainer = document.getElementById('genre-stats');
    genreStatsContainer.innerHTML = '';
    
    if (stats.genre_stats && stats.genre_stats.length > 0) {
        stats.genre_stats.forEach(genre => {
            const genreItem = document.createElement('div');
            genreItem.className = 'genre-item';
            genreItem.innerHTML = `
                <div>
                    <strong>${genre.genre || 'Без жанра'}</strong>
                </div>
                <div>
                    Игр: ${genre.count} | Часов: ${parseFloat(genre.hours || 0).toFixed(1)}
                </div>
            `;
            genreStatsContainer.appendChild(genreItem);
        });
        
        if (stats.predominant_genre) {
            document.getElementById('predominant-genre').textContent = stats.predominant_genre;
        }
    } else {
        genreStatsContainer.innerHTML = '<p>Нет данных о жанрах</p>';
    }
}

// Загрузка рекомендаций
async function loadRecommendations() {
    const userData = localStorage.getItem('user');
    if (!userData) return;
    
    const user = JSON.parse(userData);
    
    try {
        // Получаем игры пользователя
        const { data: userGames, error: userGamesError } = await supabaseClient
            .from('user_games')
            .select(`
                game_id,
                games (
                    game_genres (
                        genre_id,
                        genres (id, name)
                    )
                )
            `)
            .eq('user_id', user.id);
        
        if (userGamesError) throw userGamesError;
        
        if (!userGames || userGames.length === 0) {
            // Если нет игр, возвращаем популярные игры
            const { data: games, error } = await supabaseClient
                .from('games')
                .select(`
                    id,
                    title,
                    developer,
                    publisher,
                    release_year,
                    description,
                    game_genres (
                        genres (name)
                    )
                `)
                .order('release_year', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            
            const formattedGames = games.map(game => ({
                id: game.id,
                title: game.title,
                developer: game.developer,
                publisher: game.publisher,
                release_year: game.release_year,
                description: game.description,
                genres: game.game_genres?.map(g => g.genres?.name).filter(Boolean) || []
            }));
            
            displayGames(formattedGames, 'recommendations-container');
            return;
        }
        
        // Получаем ID игр пользователя
        const userGameIds = userGames.map(item => item.game_id);
        
        // Подсчитываем жанры (учитываем все жанры каждой игры)
        const genreCounts = {};
        userGames.forEach(item => {
            const genres = item.games?.game_genres || [];
            genres.forEach(genreItem => {
                const genreId = genreItem.genres?.id;
                if (genreId) {
                    genreCounts[genreId] = (genreCounts[genreId] || 0) + 1;
                }
            });
        });
        
        if (Object.keys(genreCounts).length === 0) {
            displayGames([], 'recommendations-container');
            return;
        }
        
        // Находим преобладающий жанр ID
        const predominantGenreId = Object.keys(genreCounts).reduce((a, b) => 
            genreCounts[a] > genreCounts[b] ? a : b
        );
        
        // Получаем игры с этим жанром через game_genres
        const { data: gameGenres, error: gameGenresError } = await supabaseClient
            .from('game_genres')
            .select(`
                game_id,
                games (
                    id,
                    title,
                    developer,
                    publisher,
                    release_year,
                    description,
                    game_genres (
                        genres (name)
                    )
                )
            `)
            .eq('genre_id', predominantGenreId);
        
        if (gameGenresError) throw gameGenresError;
        
        // Фильтруем игры, которые уже в коллекции, и форматируем
        const filteredRecommendations = gameGenres
            .map(item => item.games)
            .filter(game => game && !userGameIds.includes(game.id))
            .slice(0, 10)
            .map(game => ({
                id: game.id,
                title: game.title,
                developer: game.developer,
                publisher: game.publisher,
                release_year: game.release_year,
                description: game.description,
                genres: game.game_genres?.map(g => g.genres?.name).filter(Boolean) || []
            }));
        
        displayGames(filteredRecommendations, 'recommendations-container');
    } catch (error) {
        console.error('Ошибка загрузки рекомендаций:', error);
        showAlert('Ошибка загрузки рекомендаций', 'error');
    }
}

// Показать/скрыть разделы
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
    
    if (sectionId === 'games-section') {
        loadGames();
    }
}

// Показать уведомление
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target == modal) {
        closeEditModal();
    }
}
